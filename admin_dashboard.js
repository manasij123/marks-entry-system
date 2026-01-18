document.addEventListener('DOMContentLoaded', () => {
    // Check if user is admin, otherwise redirect
    const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
    if (!user || !user.isAdmin || !user.sessionToken) {
        alert('এই পেজটি দেখার জন্য আপনার অনুমতি নেই।');
        window.location.href = 'login.html';
        return;
    }

    // Populate year dropdowns
    const currentYear = new Date().getFullYear();
    const yearSelects = [document.getElementById('year'), document.getElementById('viewYear'), document.getElementById('marksViewYear')];


    yearSelects.forEach(select => {
        if (select) {
            for (let i = currentYear; i >= currentYear - 5; i--) {
                select.add(new Option(i, i));
            }
        }
    });

    // Initial data load
    loadTeachers();
    loadUnlockRequests();

    // Event Listeners
    document.getElementById('studentAddForm').addEventListener('submit', handleAddStudents);
    document.getElementById('viewStudentsBtn').addEventListener('click', viewStudentsBySection);
    document.getElementById('viewAllMarksBtn').addEventListener('click', viewConsolidatedMarks);
    document.getElementById('printMarksheetBtn').addEventListener('click', () => handlePrint('consolidated-marks-display'));
    document.getElementById('printProgressReportBtn').addEventListener('click', handleProgressReportPrint);

    // Setup auto logout on inactivity
    setupInactivityTimer();
});

function openTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}

async function loadTeachers() {
    const response = await fetch('/api/teachers');
    const teachers = await response.json();
    const teachersListBody = document.getElementById('teachers-list-body');
    teachersListBody.innerHTML = '';
    let count = 1;
    teachers.forEach(teacher => {
        const row = teachersListBody.insertRow();
        row.className = "hover:bg-slate-50 transition-colors";
        row.innerHTML = `
            <td class="px-6 py-4 font-mono text-slate-500">${count++}</td>
            <td class="px-6 py-4 font-semibold text-slate-700">${teacher.fullName}</td>
            <td class="px-6 py-4"><span class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold">${teacher.subject}</span></td>
            <td class="px-6 py-4 font-mono text-xs">${teacher.uniqueId || teacher._id}</td>
            <td class="px-6 py-4 font-mono text-xs text-slate-400">${teacher.password}</td>
            <td class="px-6 py-4 text-center">
                <button class="text-indigo-600 hover:text-indigo-800 font-medium text-xs mr-3" onclick="resetPassword('${teacher._id}')">Reset</button>
                <button class="text-red-500 hover:text-red-700 font-medium text-xs" onclick="deleteTeacher('${teacher._id}')">Delete</button>
            </td>
        `;
    });
}

async function handleAddStudents(event) {
    event.preventDefault();
    const year = document.getElementById('year').value;
    const section = document.getElementById('section').value;
    const namesText = document.getElementById('studentNames').value;
    const statusDiv = document.getElementById('uploadStatus');

    // Split names, trim whitespace, and filter out empty strings
    const allNames = namesText.split(',').map(name => name.trim()).filter(name => name);
    
    // Remove duplicates using a Set
    const uniqueNames = [...new Set(allNames)];
    if (uniqueNames.length === 0) {
        statusDiv.textContent = 'অনুগ্রহ করে ছাত্রীদের নাম লিখুন।';
        statusDiv.style.color = 'red';
        return;
    }

    // Create student objects with roll numbers
    const students = uniqueNames.map((name, index) => ({ roll: index + 1, name }));

    const response = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, section, students })
    });

    const result = await response.json();
    if (response.ok) {
        statusDiv.textContent = result.message;
        statusDiv.style.color = 'green';
        document.getElementById('studentAddForm').reset();
    } else {
        statusDiv.textContent = `ত্রুটি: ${result.message}`;
        statusDiv.style.color = 'red';
    }
}

async function viewStudentsBySection() {
    const year = document.getElementById('viewYear').value;
    const displayDiv = document.getElementById('student-details-display');
    displayDiv.innerHTML = 'লোড হচ্ছে...';

    let allStudentsHtml = '';
    for (const section of ['C', 'D']) {
        const response = await fetch(`/api/students/${year}/${section}`);
        const students = await response.json();
        
        allStudentsHtml += `<h3>সেকশন: ${section}</h3>`;
        if (students.length > 0) {
            const table = `<div class="overflow-x-auto mb-8 bg-white rounded-xl border border-slate-200"><table class="w-full text-sm text-left">
                <thead class="bg-slate-50 text-slate-600 font-bold uppercase text-xs border-b border-slate-200">
                    <tr>
                        <th class="px-6 py-3">Roll</th>
                        <th class="px-6 py-3">Name</th>
                        <th class="px-6 py-3 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${students.map(s => `
                        <tr class="hover:bg-slate-50">
                            <td class="px-6 py-3 font-mono text-slate-500">${s.roll}</td>
                            <td class="px-6 py-3 font-semibold text-slate-700">${s.name}</td>
                            <td class="px-6 py-3 text-center">
                                <button class="text-indigo-600 hover:text-indigo-800 font-medium text-xs mr-3" onclick="editStudent('${year}', '${section}', ${s.roll}, '${s.name.replace(/'/g, "\\'")}')">Edit</button>
                                <button class="text-red-500 hover:text-red-700 font-medium text-xs" onclick="deleteStudent('${year}', '${section}', ${s.roll})">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table></div>`;
            allStudentsHtml += table;
        } else {
            allStudentsHtml += '<p>এই সেকশনে কোনো ছাত্রী পাওয়া যায়নি।</p>';
        }
    }
    displayDiv.innerHTML = allStudentsHtml;
}

async function viewConsolidatedMarks() {
    const year = document.getElementById('marksViewYear').value;
    const section = document.getElementById('marksViewSection').value;
    const displayDiv = document.getElementById('consolidated-marks-display');
    const printBtn = document.getElementById('printMarksheetBtn');
    const progressReportPrintBtn = document.getElementById('printProgressReportBtn');

    displayDiv.innerHTML = 'লোড হচ্ছে...';
    printBtn.style.display = 'none';
    progressReportPrintBtn.style.display = 'none';
    // Fetch students and marks
    const [studentsRes, marksRes] = await Promise.all([
        fetch(`/api/students/${year}/${section}`),
        fetch(`/api/marks/consolidated/${year}/${section}`)
    ]);

    const students = await studentsRes.json();
    const marksData = await marksRes.json();

    if (students.length === 0) {
        displayDiv.innerHTML = '<p>এই সেকশনের জন্য কোনো ছাত্রী পাওয়া যায়নি।</p>';
        return;
    }

    // Fetch subjects dynamically
    // const subjectsRes = await fetch('/api/subjects');
    // const subjects = await subjectsRes.json();

    // Manually define subjects to ensure all columns appear
    // আপনার ডাটাবেসে সাবজেক্টের নাম বা কোড যা দেওয়া আছে, ঠিক সেই বানান এখানে লিখুন
    const subjects = ['BNGA', 'ENGL', 'MATH', 'PSC', 'LSC', 'HIST', 'GEGR'];

    const evolutions = ['1', '2', '3'];
    const marksByStudent = {};

    students.forEach(student => {
        marksByStudent[student.roll] = { name: student.name };
        subjects.forEach(subject => { // Now uses dynamic subjects
            marksByStudent[student.roll][subject] = {};
            evolutions.forEach(evo => {
                marksByStudent[student.roll][subject][evo] = { W: '-', P: '-' };
            });
        });
    });

    for (const key in marksData) {
        const sheet = marksData[key];
        if (sheet.data) {
            for (const roll in sheet.data) {
                if (marksByStudent[roll] && marksByStudent[roll][sheet.subject] && marksByStudent[roll][sheet.subject][sheet.evolution]) {
                    marksByStudent[roll][sheet.subject][sheet.evolution].W = sheet.data[roll].written || '-';
                    marksByStudent[roll][sheet.subject][sheet.evolution].P = sheet.data[roll].practical || '-';
                }
            }
        }
    }

    // Generate HTML table
    let tableHTML = `
        <div class="text-center mb-6">
            <h2 class="text-xl font-bold text-slate-800">Consolidated Marksheet</h2>
            <p class="text-sm text-slate-500">Year: <span class="font-bold">${year}</span> | Section: <span class="font-bold">${section}</span></p>
        </div>
        <div class="overflow-x-auto border border-slate-200 rounded-xl shadow-lg bg-white">
        <table class="w-full text-sm text-left border-collapse">
            <thead>
                <tr class="bg-slate-800 text-white text-xs uppercase tracking-wider">
                    <th class="border border-slate-600 px-4 py-3 font-bold text-center sticky left-0 z-20 bg-slate-800 shadow-md" rowspan="3" style="width: 80px; min-width: 80px; max-width: 80px;">Roll</th>
                    <th class="border border-slate-600 px-4 py-3 font-bold text-left sticky left-[80px] z-20 bg-slate-800 shadow-md" rowspan="3" style="min-width: 200px;">Name</th>`;
    subjects.forEach(sub => {
        tableHTML += `<th class="border border-slate-600 px-2 py-2 text-center bg-indigo-600 text-white font-bold" colspan="6">${sub}</th>`;
    });
    tableHTML += `</tr><tr class="bg-slate-100 text-slate-700 text-xs font-semibold">`;
    subjects.forEach(() => {
        evolutions.forEach(evo => {
            tableHTML += `<th class="border border-slate-300 px-1 py-1 text-center bg-slate-200 text-slate-700" colspan="2">Eval ${evo}</th>`;
        });
    });
    tableHTML += `</tr><tr class="bg-white text-[10px] text-slate-600">`;
     subjects.forEach(sub => {
        evolutions.forEach(evo => {
            tableHTML += `<th class="border border-slate-200 px-1 py-1 text-center w-12 bg-slate-50 font-bold text-slate-500">W</th><th class="border border-slate-200 px-1 py-1 text-center w-12 bg-white font-bold text-slate-500">P</th>`;
        });
    });
    tableHTML += `</tr></thead><tbody class="divide-y divide-slate-200 bg-white">`;

    students.sort((a, b) => a.roll - b.roll).forEach(student => {
        tableHTML += `<tr class="hover:bg-indigo-50 transition-colors group">
            <td class="border border-slate-200 px-4 py-2 font-mono text-center font-bold text-slate-700 sticky left-0 bg-white group-hover:bg-indigo-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" style="width: 80px; min-width: 80px; max-width: 80px;">${student.roll}</td>
            <td class="border border-slate-200 px-4 py-2 font-semibold whitespace-nowrap text-slate-800 sticky left-[80px] bg-white group-hover:bg-indigo-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">${student.name}</td>`;
        const studentMarks = marksByStudent[student.roll];
        subjects.forEach(sub => {
            evolutions.forEach(evo => {
                const wVal = studentMarks[sub][evo].W;
                const pVal = studentMarks[sub][evo].P;
                
                tableHTML += `<td class="border border-slate-200 px-1 py-2 text-center cursor-pointer hover:bg-yellow-100 transition-colors text-xs font-medium ${wVal === '-' ? 'text-slate-300' : 'text-slate-700'}" 
                    data-year="${year}" data-section="${section}" 
                    data-subject="${sub}" data-evo="${evo}" 
                    data-roll="${student.roll}" data-type="W"
                    onclick="makeEditable(this)">${wVal}</td>`;
                    
                tableHTML += `<td class="border border-slate-200 px-1 py-2 text-center cursor-pointer hover:bg-yellow-100 transition-colors text-xs font-medium bg-slate-50/30 ${pVal === '-' ? 'text-slate-300' : 'text-slate-700'}" 
                    data-year="${year}" data-section="${section}" 
                    data-subject="${sub}" data-evo="${evo}" 
                    data-roll="${student.roll}" data-type="P"
                    onclick="makeEditable(this)">${pVal}</td>`;
            });
        });
        tableHTML += `</tr>`;
    });

    tableHTML += '</tbody></table></div>';

    // Add Footer with Print Buttons
    tableHTML += '<div class="mt-4 overflow-x-auto"><table class="w-full text-sm border-collapse"><tfoot><tr><td colspan="2" class="px-4 py-4 text-right font-bold text-slate-700">Print Subject:</td>';
    subjects.forEach(sub => {
        // Create a safe ID for the button
        const safeSub = sub.replace(/[^a-zA-Z0-9]/g, '_');
        tableHTML += `<td colspan="6" class="px-2 py-3 text-center">
            <button id="print-btn-${safeSub}" class="inline-flex items-center justify-center gap-2 bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm hover:shadow-md w-full max-w-[120px]">
                <span>🖨️</span> Print
            </button>
        </td>`;
    });
    tableHTML += '</tr></tfoot></table></div>';

    displayDiv.innerHTML = tableHTML;

    // Attach event listeners to the new buttons
    subjects.forEach(sub => {
        const safeSub = sub.replace(/[^a-zA-Z0-9]/g, '_');
        const btn = document.getElementById(`print-btn-${safeSub}`);
        if (btn) {
            btn.onclick = () => printSpecificSubject(sub, section, year, students, marksByStudent);
        }
    });

    printBtn.style.display = 'inline-block';
    progressReportPrintBtn.style.display = 'inline-block';
}

/**
 * Makes a table cell editable on click.
 * @param {HTMLElement} td - The table cell element.
 */
function makeEditable(td) {
    if (td.querySelector('input')) return; // Already editing

    const currentValue = td.innerText === '-' ? '' : td.innerText;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    input.style.width = '50px';
    input.style.textAlign = 'center';
    
    const save = async () => {
        let newValue = input.value.trim();

        // যদি ইনপুটটি সংখ্যা হয়, তবে সামনের শূন্যগুলো সরিয়ে ফেলুন
        if (newValue !== '' && !isNaN(newValue)) {
            newValue = String(Number(newValue));
        }

        const originalValue = currentValue === '' ? '-' : currentValue;
        
        if (newValue === currentValue) {
            td.innerText = originalValue;
            return;
        }

        const { year, section, subject, evo, roll, type } = td.dataset;
        
        try {
            const response = await fetch('/api/admin/update-mark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    year, section, subject, evolution: evo, roll, type, value: newValue
                })
            });
            
            if (response.ok) {
                td.innerText = newValue === '' ? '-' : newValue;
                td.style.backgroundColor = '#d4edda'; // Success flash color
                setTimeout(() => td.style.backgroundColor = '', 1000);
            } else {
                alert('আপডেট করতে সমস্যা হয়েছে।');
                td.innerText = originalValue;
            }
        } catch (e) {
            console.error(e);
            alert('সার্ভার এরর।');
            td.innerText = originalValue;
        }
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
    });

    td.innerText = '';
    td.appendChild(input);
    input.focus();
}

function handlePrint(elementId) {
    const printContent = document.getElementById(elementId).innerHTML;
    const originalContent = document.body.innerHTML;
    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContent;
    // Re-attach event listeners as they are lost
    location.reload();
}

async function handleProgressReportPrint() {
    const year = document.getElementById('marksViewYear').value;
    const section = document.getElementById('marksViewSection').value;

    if (!year || !section) {
        alert('অনুগ্রহ করে বছর এবং সেকশন নির্বাচন করুন।');
        return;
    }

    try {
        // Fetch student data
        const studentsRes = await fetch(`/api/students/${year}/${section}`);
        const students = await studentsRes.json();

        if (students.length === 0) {
            alert('এই সেকশনে কোনো ছাত্রী পাওয়া যায়নি।');
            return;
        }

        // Fetch the report card template
        const templateRes = await fetch('report_card.html');
        const templateHtml = await templateRes.text();
        const parser = new DOMParser();
        const templateDoc = parser.parseFromString(templateHtml, 'text/html');
        const cardTemplate = templateDoc.getElementById('report-card-template');

        const printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>Progress Report Cards</title><link rel="stylesheet" href="report_card.css"></head><body>');

        // For each student, clone the template, fill data, and append to the print window
        students.sort((a, b) => a.roll - b.roll).forEach(student => {
            const cardClone = cardTemplate.cloneNode(true);
            cardClone.querySelector('.report-year').textContent = year;
            cardClone.querySelector('.student-name').textContent = student.name;
            cardClone.querySelector('.student-roll').textContent = student.roll;
            cardClone.querySelector('.student-class').textContent = section; // Assuming section is class
            printWindow.document.body.appendChild(cardClone);
        });

        printWindow.document.write('</body></html>');
        printWindow.document.close(); // Important for some browsers
        printWindow.onload = () => printWindow.print(); // Print after content is loaded
    } catch (error) {
        console.error('Error generating progress reports:', error);
        alert('রিপোর্ট কার্ড তৈরি করার সময় একটি ত্রুটি হয়েছে।');
    }
}

async function loadUnlockRequests() {
    const response = await fetch('/api/unlock-requests');
    const requests = await response.json();
    const requestsBody = document.getElementById('unlock-requests-body');
    const badge = document.getElementById('request-count-badge');
    
    requestsBody.innerHTML = '';
    const pendingRequests = requests.filter(r => r.status === 'pending');

    if (pendingRequests.length > 0) {
        badge.textContent = pendingRequests.length;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }

    pendingRequests.forEach(req => {
        const row = requestsBody.insertRow();
        row.className = "hover:bg-slate-50";
        row.innerHTML = `
            <td class="px-6 py-4 font-semibold text-slate-700">${req.teacherName}</td>
            <td class="px-6 py-4"><span class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold">${req.subject}</span></td>
            <td class="px-6 py-4 text-slate-500">${req.year}</td>
            <td class="px-6 py-4 text-slate-500">${req.section}</td>
            <td class="px-6 py-4 text-slate-500">${req.evolution}</td>
            <td class="px-6 py-4 text-center">
                <button class="text-emerald-600 hover:text-emerald-800 font-bold text-xs mr-3" onclick="approveRequest('${req.id}')">Approve</button>
                <button class="text-red-500 hover:text-red-700 font-bold text-xs" onclick="deleteRequest('${req.id}')">Deny</button>
            </td>
        `;
    });
}

async function approveRequest(id) {
    await fetch(`/api/unlock-requests/${id}/approve`, { method: 'PUT' });
    loadUnlockRequests();
}

async function deleteRequest(id) {
    await fetch(`/api/unlock-requests/${id}`, { method: 'DELETE' });
    loadUnlockRequests();
}

// Other functions like deleteTeacher, resetPassword would go here
// For brevity, they are omitted but would make API calls similar to the above.
/**
 * Deletes a teacher after confirmation.
 * @param {string} teacherId - The ID of the teacher to delete.
 */
async function deleteTeacher(teacherId) {
    if (confirm('আপনি কি নিশ্চিতভাবে এই শিক্ষিকাকে তালিকা থেকে মুছে ফেলতে চান?')) {
        try {
            const response = await fetch(`/api/teachers/${teacherId}`, { method: 'DELETE' });
            const result = await response.json();
            alert(result.message);
            if (response.ok) {
                loadTeachers(); // Refresh the teachers list
            }
        } catch (error) {
            alert('শিক্ষিকাকে মোছার সময় একটি ত্রুটি হয়েছে।');
        }
    }
}

/**
 * Resets a teacher's password after getting a new one from a prompt.
 * @param {string} teacherId - The ID of the teacher whose password will be reset.
 */
async function resetPassword(teacherId) {
    const newPassword = prompt('অনুগ্রহ করে নতুন পাসওয়ার্ড দিন:');
    if (newPassword && newPassword.trim() !== '') {
        await fetch(`/api/teachers/${teacherId}/reset-password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword.trim() })
        });
        alert('পাসওয়ার্ড সফলভাবে রিসেট করা হয়েছে।');
        loadTeachers(); // Refresh the list to show the new password
    } else if (newPassword !== null) {
        alert('পাসওয়ার্ড খালি রাখা যাবে না।');
    }
}

/**
 * Sets up a timer to automatically logout the user after 1 hour of inactivity.
 */
function setupInactivityTimer() {
    let inactivityTimer;
    const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

    function logoutUser() {
        alert('দীর্ঘক্ষণ নিষ্ক্রিয় থাকার কারণে আপনার সেশন শেষ হয়ে গেছে। অনুগ্রহ করে আবার লগইন করুন।');
        // Call the global logout function if it exists (from auth.js), otherwise do manual cleanup
        if (typeof logout === 'function') {
            logout();
        } else {
            sessionStorage.removeItem('loggedInUser');
            window.location.href = 'login.html';
        }
    }

    function resetTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(logoutUser, oneHour);
    }

    // Reset timer on any user activity
    window.onload = resetTimer;
    document.onmousemove = resetTimer;
    document.onkeypress = resetTimer;
    document.onclick = resetTimer;
    document.onscroll = resetTimer;
}

/**
 * Prints the marks list for a specific subject.
 */
function printSpecificSubject(subject, section, year, students, marksByStudent) {
    const printWindow = window.open('', '', 'height=800,width=1000');
    const evolutions = ['1', '2', '3'];
    
    let html = `
        <html>
        <head>
            <title>Marks - ${subject}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h2, h3 { text-align: center; margin: 5px 0; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
                th, td { border: 1px solid #000; padding: 5px; text-align: center; }
                th { background-color: #f0f0f0; }
                @media print {
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <h2>Subject: ${subject}</h2>
            <h3>Year: ${year} | Section: ${section}</h3>
            
            <table>
                <thead>
                    <tr>
                        <th rowspan="2">Roll</th>
                        <th rowspan="2">Name</th>
                        <th colspan="2">Evaluation 1</th>
                        <th colspan="2">Evaluation 2</th>
                        <th colspan="2">Evaluation 3</th>
                    </tr>
                    <tr>
                        <th>W</th><th>P</th>
                        <th>W</th><th>P</th>
                        <th>W</th><th>P</th>
                    </tr>
                </thead>
                <tbody>
    `;

    students.sort((a, b) => a.roll - b.roll).forEach(student => {
        const marks = marksByStudent[student.roll][subject];
        html += `<tr>
            <td>${student.roll}</td>
            <td style="text-align:left;">${student.name}</td>`;
        
        evolutions.forEach(evo => {
            html += `<td>${marks[evo].W}</td><td>${marks[evo].P}</td>`;
        });
        
        html += `</tr>`;
    });

    html += `
                </tbody>
            </table>
            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
}

/**
 * Edits a student's name.
 */
async function editStudent(year, section, roll, currentName) {
    const newName = prompt("ছাত্রীর নতুন নাম লিখুন:", currentName);
    if (newName && newName.trim() !== "" && newName !== currentName) {
        try {
            const response = await fetch(`/api/students/${year}/${section}/${roll}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() })
            });
            const result = await response.json();
            if (result.success) {
                alert(result.message);
                viewStudentsBySection(); // Refresh the list
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error(error);
            alert('আপডেট করতে সমস্যা হয়েছে।');
        }
    }
}

/**
 * Deletes a student.
 */
async function deleteStudent(year, section, roll) {
    if (confirm(`আপনি কি নিশ্চিত যে আপনি রোল ${roll}-এর ছাত্রীকে মুছে ফেলতে চান?`)) {
        try {
            const response = await fetch(`/api/students/${year}/${section}/${roll}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            alert(result.message);
            if (result.success) {
                viewStudentsBySection(); // Refresh the list
            }
        } catch (error) {
            console.error(error);
            alert('মুছে ফেলতে সমস্যা হয়েছে।');
        }
    }
}