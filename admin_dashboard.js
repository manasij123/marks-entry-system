document.addEventListener('DOMContentLoaded', () => {
    // Check if user is admin
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    if (!loggedInUser || loggedInUser.uniqueId !== 'cl_admin') {
        alert('এই পেজটি দেখার জন্য আপনার অনুমতি নেই।');
        window.location.href = 'login.html';
        return;
    }

    // Populate year dropdowns
    populateYearDropdowns();

    // Load initial data
    loadTeachersData();
    loadUnlockRequests();

    // Event Listeners
    document.getElementById('studentAddForm').addEventListener('submit', handleStudentAdd);
    document.getElementById('viewStudentsBtn').addEventListener('click', displayStudentDetails);
    document.getElementById('viewAllMarksBtn').addEventListener('click', displayConsolidatedMarks);

    // Event delegation for delete and reset buttons
    document.getElementById('teachers-list-body').addEventListener('click', handleTeacherActions);

    // Event delegation for unlock requests and marks editing
    document.getElementById('unlock-requests-body').addEventListener('click', handleUnlockRequestActions);
    document.getElementById('consolidated-marks-display').addEventListener('change', handleAdminMarkEdit);
});

/**
 * localStorage থেকে সমস্ত শিক্ষকের তথ্য লোড করে এবং টেবিলে প্রদর্শন করে।
 */
async function loadTeachersData() {
    try {
        const response = await fetch('/api/teachers');
        if (!response.ok) {
            throw new Error('Could not fetch teachers list from server.');
        }
        const teachers = await response.json();

        displayTeachersInTable(teachers);

    } catch (error) {
        console.error("Error loading teachers data:", error);
        const teachersListBody = document.getElementById('teachers-list-body');
        teachersListBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">শিক্ষকদের তালিকা লোড করতে সমস্যা হয়েছে।</td></tr>';
    }
}

function displayTeachersInTable(teachers) {
    const teachersListBody = document.getElementById('teachers-list-body');
    
    // টেবিল খালি করা
    teachersListBody.innerHTML = '';

    let serial = 1;
    // Object.keys ব্যবহার করে প্রত্যেক শিক্ষকের তথ্য পাওয়া
    for (const uniqueId in teachers) {
        if (teachers.hasOwnProperty(uniqueId)) {
            const teacher = teachers[uniqueId];

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${serial}</td>
                <td>${teacher.fullName}</td>
                <td>${teacher.subject}</td>
                <td>${uniqueId}</td>
                <td id="pass-${uniqueId}">${teacher.password}</td> 
                <td>
                    <button class="action-btn btn-reset" data-id="${uniqueId}">Reset Password</button>
                    <button class="action-btn btn-delete" data-id="${uniqueId}">Delete</button>
                </td>
            `;
            teachersListBody.appendChild(row);
            serial++;
        }
    }

    if (serial === 1) {
        // colspan updated to 6
        teachersListBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">এখনও কোনো শিক্ষক রেজিস্টার করেননি।</td></tr>';
    }
}


/**
 * Handles tab switching functionality.
 */
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

/**
 * Populates the year selection dropdowns.
 */
function populateYearDropdowns() {
    const currentYear = new Date().getFullYear();
    const yearSelect = document.getElementById('year');
    const viewYearSelect = document.getElementById('viewYear');
    const marksViewYearSelect = document.getElementById('marksViewYear');

    for (let i = 0; i < 5; i++) {
        const year = currentYear - i;
        yearSelect.innerHTML += `<option value="${year}">${year}</option>`;
        viewYearSelect.innerHTML += `<option value="${year}">${year}</option>`;
        marksViewYearSelect.innerHTML += `<option value="${year}">${year}</option>`;
    }
}

/**
 * Handles the form submission for adding new students.
 */
async function handleStudentAdd(e) {
    e.preventDefault();
    const year = document.getElementById('year').value; // Corrected ID
    const section = document.getElementById('section').value;
    const namesText = document.getElementById('studentNames').value.trim();
    const uploadStatus = document.getElementById('uploadStatus');

    if (!namesText) {
        uploadStatus.textContent = 'অনুগ্রহ করে ছাত্রছাত্রীদের নাম লিখুন।';
        uploadStatus.style.color = 'red';
        return;
    }

    const namesArray = namesText.split(',').map(name => name.trim()).filter(name => name);

    const students = namesArray.map((name, index) => ({
        Roll: index + 1,
        Name: name
    }));

    try {
        const response = await fetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, section, students })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message);
        }

        uploadStatus.textContent = result.message;
        uploadStatus.style.color = 'green';
        document.getElementById('studentNames').value = ''; // Clear the form

    } catch (error) {
        uploadStatus.textContent = `আপলোড ব্যর্থ হয়েছে: ${error.message}`;
        uploadStatus.style.color = 'red';
    }
}

/**
 * Displays the student details for the selected year.
 */
async function displayStudentDetails() {
    const year = document.getElementById('viewYear').value;
    const displayContainer = document.getElementById('student-details-display');
    displayContainer.innerHTML = ''; // Clear previous results

    const sections = ['C', 'D'];
    let foundData = false;

    for (const section of sections) {
        try {
            const response = await fetch(`/api/students/${year}/${section}`);
            const students = await response.json();

            if (students && students.length > 0) {
                foundData = true;
                const sectionDiv = document.createElement('div');
                sectionDiv.className = 'student-list-section';

                let tableHTML = `<h3>সেকশন ${section}</h3>`;
                tableHTML += `<table class="marks-table"><thead><tr><th>রোল</th><th>নাম</th></tr></thead><tbody>`;
                
                students.forEach(student => {
                    tableHTML += `<tr><td>${student.Roll}</td><td>${student.Name}</td></tr>`;
                });

                tableHTML += `</tbody></table>`;
                sectionDiv.innerHTML = tableHTML;
                displayContainer.appendChild(sectionDiv);
            }
        } catch (error) {
            console.error(`Error fetching students for Section ${section}:`, error);
        }
    }

    if (!foundData) {
        displayContainer.innerHTML = `<p>এই শিক্ষাবর্ষের (${year}) জন্য কোনো ছাত্রছাত্রীর তথ্য পাওয়া যায়নি।</p>`;
    }
}

/**
 * Fetches all marks and displays a consolidated marksheet for the admin.
 */
async function displayConsolidatedMarks() {
    // This function is now just a trigger for the editable one.
    await displayConsolidatedMarksEditable();
}

/**
 * Handles actions (delete, reset password) for teachers using event delegation.
 * @param {Event} e The click event.
 */
async function handleTeacherActions(e) {
    const target = e.target;
    const uniqueId = target.dataset.id;

    if (target.classList.contains('btn-delete')) {
        if (confirm(`আপনি কি সত্যিই '${uniqueId}' শিক্ষককে ডিলিট করতে চান?`)) {
            try {
                const response = await fetch(`/api/teachers/${uniqueId}`, { method: 'DELETE' });
                const result = await response.json();
                alert(result.message);
                if (response.ok) loadTeachersData();
            } catch (error) {
                alert('সার্ভারে ত্রুটি দেখা দিয়েছে।');
            }
        }
    }

    if (target.classList.contains('btn-reset')) {
        const newPassword = prompt(`'${uniqueId}' এর জন্য নতুন পাসওয়ার্ড দিন:`);
        if (newPassword && newPassword.trim() !== '') {
            try {
                const response = await fetch(`/api/teachers/${uniqueId}/reset-password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: newPassword.trim() })
                });
                const result = await response.json();
                alert(result.message);
                if (response.ok) loadTeachersData();
            } catch (error) {
                alert('সার্ভারে ত্রুটি দেখা দিয়েছে।');
            }
        } else if (newPassword !== null) {
            alert('পাসওয়ার্ড খালি রাখা যাবে না।');
        }
    }
}

/**
 * Loads and displays pending unlock requests.
 */
async function loadUnlockRequests() {
    try {
        const response = await fetch('/api/unlock-requests');
        const requests = await response.json();
        const pendingRequests = requests.filter(req => req.status === 'pending');
        
        const requestBody = document.getElementById('unlock-requests-body');
        const badge = document.getElementById('request-count-badge');
        requestBody.innerHTML = '';

        if (pendingRequests.length > 0) {
            badge.textContent = pendingRequests.length;
            badge.style.display = 'inline';
            pendingRequests.forEach(req => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${req.teacherName}</td>
                    <td>${req.subject}</td>
                    <td>${req.year}</td>
                    <td>${req.section}</td>
                    <td>${req.evolution}</td>
                    <td><button class="action-btn btn-approve" data-id="${req.id}">Approve</button></td>
                `;
                requestBody.appendChild(row);
            });
        } else {
            badge.style.display = 'none';
            requestBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">কোনো নতুন অনুরোধ নেই।</td></tr>';
        }
    } catch (error) {
        console.error('Error loading unlock requests:', error);
    }
}

/**
 * Handles unlock request approval.
 */
async function handleUnlockRequestActions(e) {
    if (e.target.classList.contains('btn-approve')) {
        const requestId = e.target.dataset.id;
        if (confirm(`আপনি কি এই আনলক অনুরোধটি অনুমোদন করতে চান?`)) {
            try {
                const response = await fetch(`/api/unlock-requests/${requestId}/approve`, { method: 'PUT' });
                const result = await response.json();
                alert(result.message);
                if (response.ok) loadUnlockRequests();
            } catch (error) {
                alert('সার্ভারে ত্রুটি দেখা দিয়েছে।');
            }
        }
    }
}

/**
 * Displays an editable consolidated marksheet for the admin.
 */
async function displayConsolidatedMarksEditable() {
    // ... (বাকি কোড একই থাকবে)
    const year = document.getElementById('marksViewYear').value;
    const section = document.getElementById('marksViewSection').value;
    const displayContainer = document.getElementById('consolidated-marks-display');
    displayContainer.innerHTML = 'লোড হচ্ছে...';

    try {
        // Fetch students and marks in parallel
        const [studentRes, marksRes] = await Promise.all([
            fetch(`/api/students/${year}/${section}`),
            fetch(`/api/marks/consolidated/${year}/${section}`)
        ]);

        if (!studentRes.ok) throw new Error('ছাত্রছাত্রীর তালিকা পাওয়া যায়নি।');

        const students = await studentRes.json();
        const allMarks = await marksRes.json();

        if (!students || students.length === 0) {
            displayContainer.innerHTML = `<p>এই সেকশনের জন্য কোনো ছাত্রছাত্রী নেই।</p>`;
            return;
        }

    const subjects = ["BENG", "ENGL", "MATH", "PHSC", "LISC", "HIST", "GEGR"];
    const evolutions = ["1", "2", "3"];

    let tableHTML = `<table class="marks-table"><thead>...</thead><tbody>`; // Header part is complex, building it dynamically
    
    // Build Header
    let header1 = `<th rowspan="2">রোল</th><th rowspan="2">নাম</th>`;
    let header2 = ``;
    subjects.forEach(subject => {
        header1 += `<th colspan="6">${subject}</th>`;
        evolutions.forEach(evo => {
            const fm_w = evo === '3' ? 90 : 40;
            header2 += `<th>W(E${evo}) <br><small>${fm_w}</small></th><th>P(E${evo}) <br><small>10</small></th>`;
        });
    });
    header1 += `<th rowspan="2">কার্যকলাপ</th>`; // প্রিন্ট বাটনের জন্য নতুন হেডার
    tableHTML = `<table class="marks-table"><thead><tr>${header1}</tr><tr>${header2}</tr></thead><tbody>`;

    // Build Body
    students.forEach(student => {
        let studentAllMarks = {}; // ছাত্রের সমস্ত নম্বর এখানে সংগ্রহ করা হবে
        tableHTML += `<tr><td>${student.Roll}</td><td>${student.Name}</td>`;
            subjects.forEach(subject => {
                studentAllMarks[subject] = {};
                evolutions.forEach(evo => {
                const key = `marks_${year}_${section}_${subject}_${evo}`;
                    const marksData = allMarks[key];
                const studentMarks = marksData ? (marksData.data[student.Roll] || {}) : {};
                
                const written = studentMarks.written || '';
                const practical = studentMarks.practical || '';

                studentAllMarks[subject][evo] = { written, practical }; // নম্বর সংগ্রহ করা

                tableHTML += `<td><input type="number" class="editable-mark" value="${written}" 
                                data-year="${year}" data-section="${section}" data-subject="${subject}" 
                                data-evolution="${evo}" data-roll="${student.Roll}" data-type="written"></td>`;
                tableHTML += `<td><input type="number" class="editable-mark" value="${practical}"
                                data-year="${year}" data-section="${section}" data-subject="${subject}" 
                                data-evolution="${evo}" data-roll="${student.Roll}" data-type="practical"></td>`;
            });
        });
        // প্রিন্ট বাটন যোগ করা
        const studentData = {
            roll: student.Roll,
            name: student.Name,
            year,
            section,
            marks: studentAllMarks
        };
        tableHTML += `<td><button class="action-btn btn-print" data-student='${JSON.stringify(studentData)}'>Print</button></td>`;
        tableHTML += `</tr>`;
    });

    tableHTML += `</tbody></table>`;
    displayContainer.innerHTML = tableHTML;

    // প্রিন্ট বাটনের জন্য ইভেন্ট লিসেনার যোগ করা
    document.querySelectorAll('.btn-print').forEach(button => {
        button.addEventListener('click', handlePrintMarksheet);
    });

    } catch (error) {
        displayContainer.innerHTML = `<p>মার্কশিট লোড করতে সমস্যা হয়েছে: ${error.message}</p>`;
    }
}

/**
 * Handles the printing of a single student's marksheet.
 * @param {Event} e The click event from the print button.
 */
function handlePrintMarksheet(e) {
    const studentData = JSON.parse(e.target.dataset.student);
    const { name, roll, year, section, marks } = studentData;

    // মার্কশিটের জন্য নতুন HTML তৈরি করা
    let marksheetHTML = `
        <html>
        <head>
            <title>Marksheet - ${name}</title>
            <style>
                body { font-family: 'Hind Siliguri', sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 20px; }
                .header h1 { margin: 0; }
                .header p { margin: 5px 0; }
                .student-info { margin-bottom: 20px; }
                .marks-table { width: 100%; border-collapse: collapse; }
                .marks-table th, .marks-table td { border: 1px solid #000; padding: 8px; text-align: center; }
                .marks-table th { background-color: #f2f2f2; }
                @media print {
                    body { margin: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Student Marksheet</h1>
                <p>Academic Year: ${year}</p>
            </div>
            <div class="student-info">
                <strong>Name:</strong> ${name}<br>
                <strong>Roll:</strong> ${roll}<br>
                <strong>Section:</strong> ${section}
            </div>
            <table class="marks-table">
                <thead>
                    <tr>
                        <th rowspan="2">Subject</th>
                        <th colspan="2">Evolution 1</th>
                        <th colspan="2">Evolution 2</th>
                        <th colspan="2">Evolution 3</th>
                    </tr>
                    <tr>
                        <th>Written</th><th>Practical</th>
                        <th>Written</th><th>Practical</th>
                        <th>Written</th><th>Practical</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // টেবিলের মধ্যে নম্বর যোগ করা
    for (const subject in marks) {
        marksheetHTML += `<tr><td>${subject}</td>`;
        marksheetHTML += `<td>${marks[subject]['1']?.written || '-'}</td><td>${marks[subject]['1']?.practical || '-'}</td>`;
        marksheetHTML += `<td>${marks[subject]['2']?.written || '-'}</td><td>${marks[subject]['2']?.practical || '-'}</td>`;
        marksheetHTML += `<td>${marks[subject]['3']?.written || '-'}</td><td>${marks[subject]['3']?.practical || '-'}</td>`;
        marksheetHTML += `</tr>`;
    }

    marksheetHTML += `</tbody></table></body></html>`;

    // নতুন উইন্ডোতে মার্কশিট খোলা এবং প্রিন্ট ডায়ালগ দেখানো
    const printWindow = window.open('', '_blank');
    printWindow.document.write(marksheetHTML);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

/**
 * Handles the direct editing of marks by the admin.
 */
async function handleAdminMarkEdit(e) {
    if (e.target.classList.contains('editable-mark')) {
        const input = e.target;
        const { year, section, subject, evolution, roll, type } = input.dataset;
        const newValue = input.value;

        // We need to fetch the existing data first, update it, then send it back.
        try {
            const response = await fetch(`/api/marks/${year}/${section}/${subject}/${evolution}`);
            const marksPayload = await response.json();

            if (!marksPayload.data[roll]) {
                marksPayload.data[roll] = {};
            }
            marksPayload.data[roll][type] = newValue;

            // Now, save the updated payload
            await fetch('/api/marks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year, section, subject, evolution, marksPayload })
            });

            input.style.backgroundColor = '#e6ffed'; // Visual feedback
            setTimeout(() => { input.style.backgroundColor = ''; }, 1500);
        } catch (error) {
            console.error('Failed to save mark:', error);
            alert('নম্বর সেভ করতে সমস্যা হয়েছে।');
            input.style.backgroundColor = '#ffe6e6';
        }
    }
}