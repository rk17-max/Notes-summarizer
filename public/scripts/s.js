
    // --- GLOBAL VARIABLES ---
    // --- GLOBAL VARIABLES ---
    // --- SOCKET.IO LISTENER ---
    const socket = io();

    socket.on('new-note-notification', (data) => {
        // 1. Create the toast element
        const toast = document.createElement('div');
        toast.className = 'notif-toast';
        
        // 2. Set the content using the data from the server
        toast.innerHTML = `
            <span style="font-size: 1.5rem;">🔔</span>
            <div>
                <div style="font-size: 0.85rem; opacity: 0.8;">New Upload at ${data.time}</div>
                <div><strong>${data.userName}</strong> uploaded <em>"${data.noteTitle}"</em></div>
            </div>
        `;
        
        // 3. Add it to the screen
        document.body.appendChild(toast);
        
        // 4. Slide it away and remove it after 5 seconds
        setTimeout(() => { 
            toast.style.transform = 'translateX(150%)'; 
            setTimeout(() => toast.remove(), 400); // Wait for the slide animation to finish
        }, 5000);
    });
    let selectedFile = null;
    let currentNoteData = null; 
    let allNotes = [];          // ⭐️ NEW: Stores all fetched notes
    let savedNotesIds = new Set(); // ⭐️ NEW: Stores IDs of saved notes
    let currentUserId = null
    // --- 1. NAVIGATION ---
    function showView(viewName) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        
        document.getElementById(viewName + '-view').classList.add('active');
        const navLink = document.getElementById('nav-' + viewName);
        if (navLink) navLink.classList.add('active');

        if (viewName === 'notes') fetchNotes();
        if (viewName === 'saved') fetchSavedNotes();
        if (viewName === 'profile') loadProfile();
    }

    // --- 2. UPLOAD FLOW ---
    function handleFileSelect(input) {
        if (input.files && input.files[0]) {
            selectedFile = input.files[0];
            document.getElementById('fileNameDisplay').innerText = "Selected: " + selectedFile.name;
            document.getElementById('uploadModal').style.display = 'flex'; 
        }
    }

    function closeModal() {
        document.getElementById('uploadModal').style.display = 'none';
        document.getElementById('fileInput').value = ""; 
    }

    async function submitUpload() {
        if (!selectedFile) return;

        const btn = document.getElementById('uploadBtn');
        btn.innerText = "Uploading...";
        btn.disabled = true;

        const formData = new FormData();
        formData.append('pdf', selectedFile);
        formData.append('title', document.getElementById('u-title').value);
        formData.append('description', document.getElementById('u-desc').value);
        formData.append('subject', document.getElementById('u-subject').value);
        formData.append('course', document.getElementById('u-course').value);

        try {
            const res = await fetch('/upload', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                alert("Upload Successful!");
                closeModal();
                showView('notes'); 
            } else {
                alert("Upload Failed: " + (data.error || "Unknown error"));
            }
        } catch (err) {
            console.error(err);
            alert("Error uploading file");
        } finally {
            btn.innerText = "🚀 Upload Note";
            btn.disabled = false;
        }
    }

    // --- 3. HELPER FUNCTIONS ---
    // function getThumbnailUrl(pdfUrl) {
    //     if (!pdfUrl) return 'https://via.placeholder.com/300x150?text=No+Preview';
    //     let thumbUrl = pdfUrl;
    //     if (thumbUrl.includes('cloudinary.com')) {
    //         thumbUrl = thumbUrl.replace('/upload/', '/upload/w_400,pg_1/');
    //         thumbUrl = thumbUrl.replace('.pdf', '.jpg');
    //         thumbUrl = thumbUrl.replace('/raw/', '/image/');
    //     }
    //     return thumbUrl;
    // }

    function getThumbnailUrl(fileUrl) {
        if (!fileUrl) return 'https://via.placeholder.com/300x150?text=No+Preview';
        
        let thumbUrl = fileUrl;
        
        if (thumbUrl.includes('cloudinary.com')) {
            // Check if it's a PDF
            if (thumbUrl.toLowerCase().endsWith('.pdf')) {
                thumbUrl = thumbUrl.replace('/upload/', '/upload/w_400,pg_1/');
                thumbUrl = thumbUrl.replace('.pdf', '.jpg');
            } else {
                // If it's an image, just resize it to save bandwidth
                thumbUrl = thumbUrl.replace('/upload/', '/upload/w_400,c_scale/');
            }
        }
        return thumbUrl;
    }

    // --- UPDATED HELPER: CREATE CARD ---
function createNoteCard(note, isAlreadySaved = false, isSavedViewContext = false) {
    const date = new Date(note.createdAt).toLocaleDateString();
    const thumb = getThumbnailUrl(note.fileUrl); 
    
    const card = document.createElement('div');
    card.className = 'note-card';
    card.onclick = () => openPreview(note);

    const courseBadge = note.course ? `<span class="badge course">${note.course}</span>` : '';
    const subject = note.subject || 'General';

    const isSaved = isAlreadySaved || isSavedViewContext;
    const saveBtnText = isSaved ? "❤️ Saved" : "🤍 Save";
    const saveBtnStyle = isSaved 
        ? "color:#f87171; background:rgba(239, 68, 68, 0.2);" 
        : "color:white; background:rgba(0,0,0,0.6);";

    // 👇 NEW: Check if the logged-in user owns this note
    const isOwner = currentUserId === note.userId; 
    
    // 👇 NEW: Only create the HTML for the delete button if they own it
    const deleteBtnHtml = isOwner && !isSavedViewContext ? `
        <button onclick="event.stopPropagation(); deleteNote('${note._id}')" 
            style="position:absolute; top:10px; left:10px; border:none; padding:5px 10px; border-radius:15px; cursor:pointer; background:rgba(239, 68, 68, 0.9); color:white; font-size:0.8rem; backdrop-filter:blur(4px); transition:0.2s; z-index: 10;">
            🗑️ Delete
        </button>
    ` : '';

    card.innerHTML = `
        <div style="position:relative;">
            ${deleteBtnHtml} <img src="${thumb}" class="note-thumb" onerror="this.src='https://via.placeholder.com/300x150?text=PDF'">
            <button onclick="event.stopPropagation(); toggleSave('${note._id}', this)" 
                style="position:absolute; top:10px; right:10px; border:none; padding:5px 10px; border-radius:15px; cursor:pointer; font-size:0.8rem; backdrop-filter:blur(4px); transition:0.2s; ${saveBtnStyle}">
                ${saveBtnText}
            </button>
        </div>
        
        <div class="card-content">
            <div class="card-header"><div class="note-title">${note.title}</div></div>
            <div class="badges"><span class="badge">${subject}</span>${courseBadge}</div>
            <div class="card-footer">
                <span class="note-date">${date}</span>
                <span class="view-btn">View Note →</span>
                <span class="view-btn" onclick="event.stopPropagation(); startQuiz('${note.fileUrl}')">🧠 Quiz Me</span>
            </div>
        </div>
    `;
    return card;
}
    // --- 4. DATA FETCHING ---
    // --- UPDATED: FETCH NOTES ---
// --- 4. DATA FETCHING & FILTERING ---
    
    // 1. Fetch Notes (Updated to save data globally)
    async function fetchNotes() {
        const grid = document.getElementById('notesGrid');
        grid.innerHTML = '<p>Loading notes...</p>';
        
        try {
            // A. Get Saved IDs first (for the red heart logic)
            const savedRes = await fetch('/saved-notes');
            const savedData = await savedRes.json();
            savedNotesIds.clear();
            if (savedData.success) {
                savedData.notes.forEach(note => savedNotesIds.add(note._id));
            }

            // B. Get all notes
            const res = await fetch('/notes'); 
            const data = await res.json();

            if (data.success && Array.isArray(data.notes) && data.notes.length > 0) {
                allNotes = data.notes; // Store them in our global variable
                populateFilterDropdowns(); // Fill the Subject/Course dropdowns dynamically
                applyFilters(); // Draw the cards on the screen
            } else {
                grid.innerHTML = "<p>No notes found. Upload one!</p>";
                allNotes = [];
            }
        } catch (err) { console.error("Error fetching notes:", err); }
    }

    // 2. Populate Dropdowns dynamically based on user's actual tags
    function populateFilterDropdowns() {
        const subjectSelect = document.getElementById('subjectFilter');
        const courseSelect = document.getElementById('courseFilter');
        
        // Extract unique subjects and courses using Sets
        const subjects = [...new Set(allNotes.map(n => n.subject).filter(Boolean))];
        const courses = [...new Set(allNotes.map(n => n.course).filter(Boolean))];

        // Reset dropdowns
        subjectSelect.innerHTML = '<option value="">All Subjects</option>';
        courseSelect.innerHTML = '<option value="">All Courses</option>';

        // Add options
        subjects.forEach(s => subjectSelect.innerHTML += `<option value="${s}">${s}</option>`);
        courses.forEach(c => courseSelect.innerHTML += `<option value="${c}">${c}</option>`);
    }

    // 3. Apply Filters and Render
    function applyFilters() {
        const grid = document.getElementById('notesGrid');
        
        // Read current values from the UI
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const subjectVal = document.getElementById('subjectFilter').value;
        const courseVal = document.getElementById('courseFilter').value;

        grid.innerHTML = ''; // Clear current grid

        // Filter the global array
        const filteredNotes = allNotes.filter(note => {
            // Check if title includes search term
            const matchSearch = note.title.toLowerCase().includes(searchTerm);
            // Check if subject matches (or if 'All Subjects' is selected)
            const matchSubject = subjectVal === "" || note.subject === subjectVal;
            // Check if course matches (or if 'All Courses' is selected)
            const matchCourse = courseVal === "" || note.course === courseVal;
            
            return matchSearch && matchSubject && matchCourse;
        });

        // Render the filtered results
        if (filteredNotes.length > 0) {
            filteredNotes.forEach(note => {
                const isSaved = savedNotesIds.has(note._id);
                grid.appendChild(createNoteCard(note, isSaved, false));
            });
        } else {
            grid.innerHTML = "<p style='color:var(--text-muted);'>No notes match your filters.</p>";
        }
    }

    async function fetchSavedNotes() {
    const grid = document.getElementById('savedGrid');
    grid.innerHTML = '<p>Loading...</p>';
    try {
        const res = await fetch('/saved-notes');
        const data = await res.json();
        if (data.success && data.notes.length > 0) {
            grid.innerHTML = ""; 
            data.notes.forEach(note => {
                // TRUE for saved, TRUE for savedViewContext
                grid.appendChild(createNoteCard(note, true, true));
            });
        } else {
            grid.innerHTML = "<p>No saved notes yet. Go explore!</p>";
        }
    } catch (err) { console.error(err); }
}
// --- DELETE NOTE FUNCTION ---
    async function deleteNote(noteId) {
        if (!confirm("Are you sure you want to permanently delete this note?")) {
            return;
        }

        try {
            const res = await fetch(`/notes/${noteId}`, { method: 'DELETE' });
            const data = await res.json();

            if (data.success) {
                // Remove the note from our global array
                allNotes = allNotes.filter(n => n._id !== noteId);
                // Redraw the grid without the deleted note
                applyFilters(); 
            } else {
                alert("Error: " + data.error);
            }
        } catch (err) {
            console.error(err);
            alert("Failed to connect to the server.");
        }
    }
    async function toggleSave(noteId, btnElement) {
        try {
            const res = await fetch(`/save/${noteId}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                if (data.isSaved) {
                    btnElement.innerText = "❤️ Saved";
                    btnElement.style.background = "rgba(239, 68, 68, 0.2)";
                    btnElement.style.color = "#f87171";
                } else {
                    btnElement.innerText = "🤍 Save";
                    btnElement.style.background = "rgba(0,0,0,0.6)";
                    btnElement.style.color = "white";
                    if(document.getElementById('saved-view').classList.contains('active')) {
                        btnElement.closest('.note-card').remove();
                    }
                }
            }
        } catch (err) { alert("Error saving note"); }
    }
    
    // --- 5. PREVIEW & AI SUMMARY ---
    function openPreview(note) {
        currentNoteData = note; 
        document.getElementById('previewTitle').innerText = note.title;
        document.getElementById('previewDate').innerText = new Date(note.createdAt).toDateString();
        document.getElementById('downloadLink').href = note.fileUrl;
        
        const summaryContent = document.getElementById('summaryContent');
        const summaryBtn = document.getElementById('summaryBtn');
        
        if(summaryContent) summaryContent.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">Click the button below to generate a study summary.</p>';
        if(summaryBtn) {
            summaryBtn.disabled = false;
            summaryBtn.innerText = "✨ Generate Summary";
        }
        showView('preview');
    }

    async function requestSummary() {
        if (!currentNoteData) return;
        const summaryContent = document.getElementById('summaryContent');
        const btn = document.getElementById('summaryBtn');

        btn.innerText = "Thinking...";
        btn.disabled = true;
        summaryContent.innerHTML = `
            <div style="text-align:center; padding:2rem; color:var(--primary);">
                <p>Reading your notes...</p>
                <p style="font-size:0.8rem; color:var(--text-muted);">This may take a few seconds.</p>
            </div>
        `;

        try {
            const res = await fetch('/summarize-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileUrl: currentNoteData.fileUrl })
            });
            const data = await res.json();
            if (data.success) {
                summaryContent.innerHTML = marked.parse(data.summary);
                btn.innerText = "✨ Regenerate";
            } else {
                summaryContent.innerHTML = `<p style="color:red">Error: ${data.error}</p>`;
                btn.innerText = "Try Again";
            }
        } catch (err) {
            console.error(err);
            summaryContent.innerHTML = `<p style="color:red">Failed to connect to AI.</p>`;
            btn.innerText = "Try Again";
        } finally {
            btn.disabled = false;
        }
    }

    // --- 6. PROFILE ---
    async function loadProfile() {
        try {
            const res = await fetch('/profile');
            const data = await res.json();
            if (data.success) {
                const u = data.user;
                currentUserId = u._id;
                document.getElementById('p-name').innerText = `${u.firstName} ${u.lastName}`;
                document.getElementById('p-email').innerText = u.email;
                document.getElementById('p-studentId').innerText = u.studentId || "N/A";
                document.getElementById('p-dept').innerText = u.department || "General";
                document.querySelector('.profile-icon').innerText = u.firstName.charAt(0);
            }
        } catch (err) { console.error(err); }
    }

    // Initialize
    loadProfile();
