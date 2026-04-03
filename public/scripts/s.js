document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  let selectedFile = null;
  let currentNoteData = null;
  let allNotes = [];
  let noteDirectory = {}; 
  let currentUserId = null;
  
  // 📝 Setup Quill Rich Text Editor
  let quill = new Quill('#quillEditor', {
      theme: 'snow',
      placeholder: 'Type your quick notes here...'
  });
  let uploadMode = 'file'; // 'file' or 'text'

  // ☀️ Dark/Light Mode Theme Logic
  window.toggleTheme = function() {
      document.body.classList.toggle('light-mode');
      const isLight = document.body.classList.contains('light-mode');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      document.getElementById('themeToggle').innerText = isLight ? '🌙' : '☀️';
  };
  if (localStorage.getItem('theme') === 'light') toggleTheme();

  // ⚡ LIVE NOTIFICATION TOASTS
  socket.on('new-note-notification', data => {
    const toast = document.createElement('div');
    toast.className = 'notif-toast';
    toast.innerHTML = `
      <span style="font-size:1.5rem;">🔔</span>
      <div><strong>${data.userName}</strong> uploaded <em>"${data.noteTitle}"</em><br>
      <small>${data.time}</small></div>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transform = 'translateX(150%)';
      setTimeout(() => toast.remove(), 400);
    }, 5000);
  });

  // 🔄 VIEW SWITCHER
  window.showView = function (viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const section = document.getElementById(`${viewName}-view`);
    const nav = document.getElementById(`nav-${viewName}`);
    if (section) section.classList.add('active');
    if (nav) nav.classList.add('active');
    if (viewName === 'notes') fetchNotes();
    if (viewName === 'saved') fetchSavedNotes();
    if (viewName === 'profile') loadProfile();
  };

  // 📁 FILE/TEXT UPLOAD LOGIC
  window.switchUploadMode = function(mode) {
      uploadMode = mode;
      if(mode === 'file') {
          document.getElementById('fileUploadSection').style.display = 'block';
          document.getElementById('textUploadSection').style.display = 'none';
          document.getElementById('btnModeFile').style.background = 'var(--primary)';
          document.getElementById('btnModeFile').style.color = 'white';
          document.getElementById('btnModeText').style.background = 'rgba(255,255,255,0.1)';
          document.getElementById('btnModeText').style.color = 'var(--text-muted)';
      } else {
          document.getElementById('fileUploadSection').style.display = 'none';
          document.getElementById('textUploadSection').style.display = 'block';
          document.getElementById('btnModeText').style.background = 'var(--primary)';
          document.getElementById('btnModeText').style.color = 'white';
          document.getElementById('btnModeFile').style.background = 'rgba(255,255,255,0.1)';
          document.getElementById('btnModeFile').style.color = 'var(--text-muted)';
      }
  };

  window.handleFileSelect = function (input) {
    if (input.files?.[0]) {
      selectedFile = input.files[0];
      document.getElementById('fileNameDisplay').innerText = `Selected: ${selectedFile.name}`;
      document.getElementById('uploadModal').style.display = 'flex';
    }
  };

  window.closeModal = function () {
    document.getElementById('uploadModal').style.display = 'none';
    selectedFile = null;
    document.getElementById('fileNameDisplay').innerText = '';
    quill.setText(''); 
  };

 window.submitUpload = async function () {
    if (uploadMode === 'file' && !selectedFile) return alert('Please select a PDF or Image.');
    if (uploadMode === 'text' && quill.getText().trim().length === 0) return alert('Please write some text.');

    const btn = document.getElementById('uploadBtn');
    btn.innerText = 'Processing...';
    btn.disabled = true;

    const formData = new FormData();
    // 📝 Ensure all these IDs match your HTML inputs!
    formData.append('title', document.getElementById('u-title').value || 'Untitled Note');
    formData.append('description', document.getElementById('u-desc').value || 'No description provided');
    formData.append('subject', document.getElementById('u-subject').value || 'General');
    formData.append('course', document.getElementById('u-course').value || '');

    try {
        if (uploadMode === 'file') {
            formData.append('pdf', selectedFile);
            await sendFormData(formData);
        } else {
            const element = quill.root.innerHTML;
            const opt = { 
                margin: 0.5, 
                filename: 'quick-note.pdf', 
                jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } 
            };
            
            html2pdf().set(opt).from(element).outputPdf('blob').then(async (pdfBlob) => {
                formData.append('pdf', pdfBlob, 'quick-note.pdf');
                await sendFormData(formData);
            });
        }
    } catch (err) {
        console.error(err);
        alert('Error preparing upload');
        btn.innerText = '🚀 Save Note';
        btn.disabled = false;
    }
};
async function sendFormData(formData) {
      try {
        const res = await fetch('/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            alert('Upload Successful!');
            closeModal();
            showView('notes');
        } else {
            alert(`Upload Failed: ${data.error || 'Unknown'}`);
        }
      } catch (err) {
          console.error("Upload error:", err);
          alert('Error uploading file');
      } finally {
          document.getElementById('uploadBtn').innerText = '🚀 Save Note';
          document.getElementById('uploadBtn').disabled = false;
      }
  }

  function getThumbnailUrl(fileUrl) {
    if (!fileUrl) return 'https://via.placeholder.com/300x150?text=No+Preview';
    let thumb = fileUrl;
    if (thumb.includes('cloudinary.com')) {
      thumb = thumb.toLowerCase().endsWith('.pdf')
        ? thumb.replace('/upload/', '/upload/w_400,pg_1/').replace('.pdf', '.jpg')
        : thumb.replace('/upload/', '/upload/w_400,c_scale/');
    }
    return thumb;
  }

  // 📚 MERGED NOTE CARD CREATION (With Star Ratings & Your Custom Layout)
  function createNoteCard(note, isAlreadySaved = false, isSavedViewContext = false) {
    noteDirectory[note._id] = note; // Critical for Preview functioning

    const date = new Date(note.createdAt).toLocaleDateString();
    const thumb = getThumbnailUrl(note.fileUrl); 
    
    const card = document.createElement('div');
    card.className = 'note-card';
    card.onclick = () => openPreview(note._id); // Safely passes the ID

    const courseBadge = note.course ? `<span class="badge course">${note.course}</span>` : '';
    const subject = note.subject || 'General';

    const isSaved = isAlreadySaved || isSavedViewContext;
    const saveBtnText = isSaved ? "❤️ Saved" : "🤍 Save";
    const saveBtnStyle = isSaved 
        ? "color:#f87171; background:rgba(239, 68, 68, 0.2);" 
        : "color:white; background:rgba(0,0,0,0.6);";

    // Check if the logged-in user owns this note
    const isOwner = currentUserId === note.userId; 
    
    // Delete Button Overlay
    const deleteBtnHtml = isOwner && !isSavedViewContext ? `
        <button onclick="event.stopPropagation(); deleteNote('${note._id}')" 
            style="position:absolute; top:10px; left:10px; border:none; padding:5px 10px; border-radius:15px; cursor:pointer; background:rgba(239, 68, 68, 0.9); color:white; font-size:0.8rem; backdrop-filter:blur(4px); transition:0.2s; z-index: 10;">
            🗑️ Delete
        </button>
    ` : '';

    // ⭐ Star Rating Logic for the Card
    const avgRating = note.averageRating ? note.averageRating.toFixed(1) : "New";
    const stars = note.averageRating ? "⭐" : "🌟";

    card.innerHTML = `
        <div style="position:relative;">
            ${deleteBtnHtml} 
            <img src="${thumb}" class="note-thumb" onerror="this.src='https://via.placeholder.com/300x150?text=PDF'">
            <button onclick="event.stopPropagation(); toggleSave('${note._id}', this)" 
                style="position:absolute; top:10px; right:10px; border:none; padding:5px 10px; border-radius:15px; cursor:pointer; font-size:0.8rem; backdrop-filter:blur(4px); transition:0.2s; ${saveBtnStyle}">
                ${saveBtnText}
            </button>
        </div>
        
        <div class="card-content" style="display: flex; flex-direction: column; height: 100%;">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:flex-start; gap: 10px;">
                <div class="note-title" style="margin-bottom: 5px;">${note.title}</div>
                <span style="background:rgba(255,193,7,0.2); color:#ffc107; padding:2px 8px; border-radius:10px; font-size:0.8rem; font-weight:bold; white-space:nowrap;">
                    ${avgRating} ${stars}
                </span>
            </div>
            
            <div class="badges" style="margin-bottom: 10px;">
                <span class="badge">${subject}</span>${courseBadge}
            </div>
            
            <div class="card-footer" style="margin-top: auto; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                <span class="note-date" style="font-size: 0.75rem; color: var(--text-muted);">${date}</span>
                <span class="view-btn" style="cursor: pointer; font-size: 0.85rem; color: var(--primary); font-weight: 600;">View Note →</span>
                <button class="action-btn share-btn" onclick="shareNote('${note._id}')">
    🔗 Share
</button>
                <span class="view-btn" onclick="event.stopPropagation(); startQuiz('${note.fileUrl}')" style="cursor: pointer; background:rgba(139, 92, 246, 0.2); color: #8b5cf6; padding: 3px 8px; border-radius: 5px;">🧠 Quiz Me</span>
            </div>
        </div>
    `;
    return card;
  }

  // 🧩 FETCH NOTES
  async function fetchNotes() {
    const grid = document.getElementById('notesGrid');
    grid.innerHTML = '<p>Loading...</p>';
    try {
      const res = await fetch('/notes');
      const data = await res.json();
      if (data.success) {
        allNotes = data.notes;
        applyFilters();
      } else { grid.innerHTML = '<p>No notes found.</p>'; }
    } catch { grid.innerHTML = '<p>Error loading notes.</p>'; }
  }

  window.applyFilters = function () {
    const grid = document.getElementById('notesGrid');
    grid.innerHTML = '';
    const term = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const filtered = allNotes.filter(n => n.title.toLowerCase().includes(term));
    filtered.forEach(note => grid.appendChild(createNoteCard(note)));
  };

  // ❤️ TOGGLE SAVE
  window.toggleSave = async function (noteId, btn) {
    try {
      const res = await fetch(`/save/${noteId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        btn.innerText = data.isSaved ? '❤️ Saved' : '🤍 Save';
        btn.style.color = data.isSaved ? '#f87171' : 'white';
        btn.style.background = data.isSaved ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.6)';
        if (document.getElementById('saved-view').classList.contains('active')) fetchSavedNotes();
      }
    } catch { alert('Error saving note'); }
  };

  window.fetchSavedNotes = async function () {
    const grid = document.getElementById('savedGrid');
    grid.innerHTML = '<p style="color:var(--text-muted);">Loading your collection...</p>';
    try {
      const res = await fetch('/saved'); 
      const data = await res.json();
      grid.innerHTML = '';
      if (data.success && data.notes.length > 0) {
        data.notes.forEach(note => grid.appendChild(createNoteCard(note, true, true)));
      } else { grid.innerHTML = '<p style="color:var(--text-muted);">No saved notes yet. Go heart some!</p>'; }
    } catch { grid.innerHTML = '<p style="color:var(--error);">Error loading saved notes.</p>'; }
  };

  // 🗑️ DELETE NOTE
  window.deleteNote = async function (id) {
    if (!confirm('Delete this note?')) return;
    const res = await fetch(`/notes/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      allNotes = allNotes.filter(n => n._id !== id);
      applyFilters();
    } else { alert('Error deleting'); }
  };

  // ⭐ SUBMIT RATING
  window.submitRating = async function (score) {
    if (!currentNoteData) return;
    try {
        const res = await fetch(`/notes/${currentNoteData._id}/rate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score })
        });
        const data = await res.json();
        
        if (data.success) {
            currentNoteData.averageRating = data.newAverage;
            const displayObj = document.getElementById('displayRating');
            if(displayObj) displayObj.innerText = `${data.newAverage.toFixed(1)} ⭐ (${data.totalRatings} ratings)`;
            alert('Thanks for rating!');
            fetchNotes(); 
        } else { alert(data.error); }
    } catch (err) { alert("Error submitting rating."); }
  };

  // 📄 PREVIEW & ACTUAL PDF RENDERING
  window.openPreview = function (noteId) {
    const note = noteDirectory[noteId];
    if (!note) return;
    currentNoteData = note;
    document.getElementById('previewTitle').innerText = note.title;
    document.getElementById('downloadLink').href = note.fileUrl;
    document.getElementById('summaryContent').innerHTML = `<p style="opacity:0.7;">Click generate to get an AI summary.</p>`;
    
    // Update Rating UI if it exists in the header
    const displayObj = document.getElementById('displayRating');
    if(displayObj) {
        if(note.averageRating) displayObj.innerText = `${note.averageRating.toFixed(1)} ⭐ Rated`;
        else displayObj.innerText = `Rate this note:`;
    }
    
    // Embed the PDF/Image natively
    const viewer = document.getElementById('docViewerContainer');
    if (note.fileUrl.toLowerCase().endsWith('.pdf')) {
        viewer.innerHTML = `<iframe src="${note.fileUrl}" width="100%" height="100%" style="border:none; border-radius:0.5rem;"></iframe>`;
    } else {
        viewer.innerHTML = `<img src="${note.fileUrl}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:0.5rem;">`;
    }

    showView('preview');
  };

  // ✨ GENERATE AI SUMMARY
  window.requestSummary = async function () {
    if (!currentNoteData) return;
    const cont = document.getElementById('summaryContent');
    const btn = document.getElementById('summaryBtn');
    btn.disabled = true; btn.innerText = 'Thinking...';
    cont.innerHTML = '<p>Reading your notes...</p>';
    try {
      const res = await fetch('/summarize-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: currentNoteData.fileUrl })
      });
      const data = await res.json();
      cont.innerHTML = data.success ? marked.parse(data.summary) : `<p style="color:red;">${data.error}</p>`;
      btn.innerText = '✨ Summary';
    } catch {
      cont.innerHTML = '<p style="color:red;">Error connecting to AI.</p>';
    } finally { btn.disabled = false; }
  };

  // 🧠 GENERATE AI QUIZ (Works from Preview AND directly from the Card!)
  window.startQuiz = async function (cardFileUrl = null) {
    const targetUrl = cardFileUrl || (currentNoteData ? currentNoteData.fileUrl : null);
    if (!targetUrl) return;

    const modal = document.getElementById('quizModal');
    const content = document.getElementById('quizContent');
    const btn = document.getElementById('quizBtn');
    if(btn) btn.disabled = true;
    
    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align:center; padding:40px;"><p style="font-size:1.2rem;">🤖 Crafting quiz...</p></div>';

    try {
        const res = await fetch('/generate-quiz', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileUrl: targetUrl })
        });
        const data = await res.json();
        if (data.success) {
            content.innerHTML = ''; 
            data.quiz.forEach((q, qIndex) => {
                const qDiv = document.createElement('div');
                qDiv.style.marginBottom = '25px';
                qDiv.innerHTML = `<h3 style="margin-bottom:15px; font-size:1.1rem;">${qIndex + 1}. ${q.question}</h3>`;
                q.options.forEach((opt, optIndex) => {
                    const optBtn = document.createElement('button');
                    optBtn.className = 'quiz-option';
                    optBtn.innerText = opt;
                    optBtn.onclick = function() {
                        const siblings = qDiv.querySelectorAll('.quiz-option');
                        siblings.forEach(b => { b.style.pointerEvents = 'none'; b.disabled = true; });
                        if (optIndex === q.correctIndex) {
                            this.classList.add('correct'); this.innerText += " ✅ Correct!";
                        } else {
                            this.classList.add('wrong'); this.innerText += " ❌ Incorrect";
                            siblings[q.correctIndex].classList.add('correct');
                        }
                    };
                    qDiv.appendChild(optBtn);
                });
                content.appendChild(qDiv);
            });
        } else { content.innerHTML = `<p style="color:var(--error);">Error: ${data.error}</p>`; }
    } catch (err) { content.innerHTML = `<p style="color:var(--error);">Failed connection.</p>`; } 
    finally { 
        if (btn) {
            // Change the text to show it's on cooldown
            btn.innerText = "⏳ Cooldown...";
            
            // Wait 5000 milliseconds (5 seconds) before turning it back on
            setTimeout(() => {
                btn.disabled = false;
                btn.innerText = "🧠 Quiz Me"; // Or whatever your original button text was
            }, 5000);
        }
    }
  };
  window.shareNote = function(noteId) {
    const shareUrl = `${window.location.origin}/share/${noteId}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
        alert("Share link copied to clipboard! Paste it in WhatsApp to see the preview.");
    });
};

  // 👤 LOAD USER PROFILE
  async function loadProfile() {
    try {
        const res = await fetch('/profile');
        const data = await res.json();
        if (data.success) {
            currentUserId = data.user._id;
            document.getElementById('p-name').innerText = `${data.user.firstName || ''} ${data.user.lastName || ''}`;
            document.getElementById('p-email').innerText = data.user.email;
            document.querySelector('.profile-icon').innerText = data.user.firstName ? data.user.firstName.charAt(0) : '?';
        }
    } catch(err) { console.log("Error loading profile", err); }
  }


  // Initialize
  loadProfile();

  fetchNotes();
  const urlParams = new URLSearchParams(window.location.search);
    const sharedNoteId = urlParams.get('note');

    if (sharedNoteId) {
        // We wait 1.5s to give 'fetchNotes' time to download the notes into noteDirectory
        setTimeout(() => {
            if (typeof openPreview === 'function') {
                console.log("🔍 Auto-opening shared note:", sharedNoteId);
                openPreview(sharedNoteId);
            }
        }, 1500);
    }

});