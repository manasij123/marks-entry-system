document.addEventListener('DOMContentLoaded', () => {
    // Check if user is admin, otherwise redirect
    const user = JSON.parse(sessionStorage.getItem('user'));
    if (!user || !user.isAdmin) {
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
    document.getElementById('printMarksheetBtn').addEventListener('click', handlePrint);
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
    for (const id in teachers) {
        const teacher = teachers[id];
        const row = teachersListBody.insertRow();
        row.innerHTML = `
            <td>${count++}</td>
            <td>${teacher.fullName}</td>
            <td>${teacher.subject}</td>
            <td>${teacher.uniqueId || teacher._id}</td>
            <td>${teacher.password}</td>
            <td>
                <button onclick="resetPassword('${teacher._id}')">Reset Password</button>
                <button onclick="deleteTeacher('${teacher._id}')">Delete</button>
            </td>
        `;
    }
}

async function handleAddStudents(event) {
    event.preventDefault();
    const year = document.getElementById('year').value;
    const section = document.getElementById('section').value;
    const namesText = document.getElementById('studentNames').value;
    const statusDiv = document.getElementById('uploadStatus');

    const studentNames = namesText.split(',').map(name => name.trim()).filter(name => name);
    if (studentNames.length === 0) {
        statusDiv.textContent = 'অনুগ্রহ করে ছাত্রীদের নাম লিখুন।';
        statusDiv.style.color = 'red';
        return;
    }

    const students = studentNames.map((name, index) => ({ roll: index + 1, name }));

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
            const table = `<table class="marks-table">
                <thead><tr><th>রোল</th><th>ছাত্রীর নাম</th></tr></thead>
                <tbody>
                    ${students.map(s => `<tr><td>${s.roll}</td><td>${s.name}</td></tr>`).join('')}
                </tbody>
            </table>`;
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
    displayDiv.innerHTML = 'লোড হচ্ছে...';
    printBtn.style.display = 'none';

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

    // Process marks
    const subjects = ['BENG', 'ENGL', 'MATH', 'PHSC', 'LISC', 'HIST', 'GEGR'];
    const evolutions = ['1', '2', '3'];
    const marksByStudent = {};

    students.forEach(student => {
        marksByStudent[student.roll] = { name: student.name };
        subjects.forEach(subject => {
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
        <div style="text-align: center; margin-bottom: 1rem;">
            <h2>Consolidated Marksheet</h2>
            <p><strong>Year:</strong> ${year} | <strong>Section:</strong> ${section}</p>
        </div>
        <table class="marks-table">
            <thead>
                <tr>
                    <th rowspan="2">রোল</th>
                    <th rowspan="2">ছাত্রীর নাম</th>`;
    subjects.forEach(sub => {
        tableHTML += `<th colspan="6">${sub}</th>`;
    });
    tableHTML += `</tr><tr>`;
    subjects.forEach(() => {
        evolutions.forEach(evo => {
            tableHTML += `<th colspan="2">Evo ${evo}</th>`;
        });
    });
    tableHTML += `</tr><tr><th></th><th></th>`;
     subjects.forEach(sub => {
        evolutions.forEach(evo => {
            tableHTML += `<th>W</th><th>P</th>`;
        });
    });
    tableHTML += `</tr></thead><tbody>`;

    students.sort((a, b) => a.roll - b.roll).forEach(student => {
        tableHTML += `<tr><td>${student.roll}</td><td>${student.name}</td>`;
        const studentMarks = marksByStudent[student.roll];
        subjects.forEach(sub => {
            evolutions.forEach(evo => {
                tableHTML += `<td>${studentMarks[sub][evo].W}</td><td>${studentMarks[sub][evo].P}</td>`;
            });
        });
        tableHTML += `</tr>`;
    });

    tableHTML += '</tbody></table>';
    displayDiv.innerHTML = tableHTML;
    printBtn.style.display = 'inline-block'; // Show the print button
}

function handlePrint() {
    window.print();
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
        row.innerHTML = `
            <td>${req.teacherName}</td>
            <td>${req.subject}</td>
            <td>${req.year}</td>
            <td>${req.section}</td>
            <td>${req.evolution}</td>
            <td>
                <button onclick="approveRequest('${req.id}')">Approve</button>
                <button onclick="deleteRequest('${req.id}')">Deny</button>
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