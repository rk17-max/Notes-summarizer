
    async function startQuiz(fileUrl) {
        const modal = document.getElementById('quizModal');
        const content = document.getElementById('quizContent');
        
        modal.style.display = 'flex';
        content.innerHTML = '<div style="text-align:center; padding:40px;"><p style="font-size:1.2rem;">🤖 Gemini is reading your notes and crafting a quiz...</p><p style="opacity:0.6; margin-top:10px;">This usually takes 5-10 seconds.</p></div>';

        try {
            const res = await fetch('/generate-quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileUrl: fileUrl })
            });
            const data = await res.json();

            if (data.success) {
                content.innerHTML = ''; // Clear loader
                
                data.quiz.forEach((q, qIndex) => {
                    const qDiv = document.createElement('div');
                    qDiv.style.marginBottom = '25px';
                    
                    // Question Text
                    qDiv.innerHTML = `<h3 style="margin-bottom:15px; font-size:1.1rem;">${qIndex + 1}. ${q.question}</h3>`;
                    
                    // Answer Options
                    q.options.forEach((opt, optIndex) => {
                        const btn = document.createElement('button');
                        btn.className = 'quiz-option';
                        btn.innerText = opt;
                        
                        btn.onclick = function() {
                            // Disable all buttons in this question after guessing
                            const siblings = qDiv.querySelectorAll('.quiz-option');
                            siblings.forEach(b => b.style.pointerEvents = 'none');

                            if (optIndex === q.correctIndex) {
                                this.classList.add('correct');
                                this.innerText += " ✅ Correct!";
                            } else {
                                this.classList.add('wrong');
                                this.innerText += " ❌ Incorrect";
                                // Show the correct answer
                                siblings[q.correctIndex].classList.add('correct');
                            }
                        };
                        qDiv.appendChild(btn);
                    });
                    content.appendChild(qDiv);
                });
            } else {
                content.innerHTML = `<p style="color:var(--error);">Error generating quiz: ${data.error}</p>`;
            }
        } catch (err) {
            content.innerHTML = `<p style="color:var(--error);">Failed to connect to the AI server.</p>`;
        }
    }
