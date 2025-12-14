document.addEventListener('DOMContentLoaded', () => {
    // ব্যবহারকারী লগইন করা আছে কিনা তা পরীক্ষা করে
    checkAuth();

    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    if (!loggedInUser || loggedInUser.uniqueId === 'cl_admin') {
        // অ্যাডমিনকে এই পেজে আসতে বাধা দেওয়া হচ্ছে
        window.location.href = 'login.html';
        return;
    }

    // ব্যবহারকারীর তথ্য হেডার এবং ড্রপডাউনে দেখানো
    document.getElementById('userFullName').textContent = loggedInUser.fullName;
    document.getElementById('menuUserFullName').textContent = loggedInUser.fullName;
    document.getElementById('menuUserSubject').textContent = loggedInUser.subject;
    document.getElementById('menuUserId').textContent = loggedInUser.uniqueId;

    // Load notifications on page load
    loadNotifications();

    // "ছাত্রছাত্রীদের তালিকা দেখুন" বাটনে ইভেন্ট লিসেনার যোগ করা
    document.getElementById('loadStudentsBtn').addEventListener('click', loadStudentListForMarksEntry);

    // বাটনগুলোর জন্য ইভেন্ট লিসেনার
    document.getElementById('saveDraftBtn').addEventListener('click', () => saveOrSubmitMarks('draft'));
    document.getElementById('marksForm').addEventListener('submit', (e) => {
        e.preventDefault();
        saveOrSubmitMarks('submitted');
    });
    document.getElementById('unlockBtn').addEventListener('click', requestUnlock);
});

/**
 * নির্বাচিত সেকশন এবং শিক্ষাবর্ষ অনুযায়ী ছাত্রছাত্রীদের তালিকা লোড করে।
 */
async function loadStudentListForMarksEntry() {
    const section = document.getElementById('section').value;
    const evolution = document.getElementById('evolution').value;
    const warningMessage = document.getElementById('warning-message');
    const tableContainer = document.getElementById('marks-entry-table-container');

    if (!section || !evolution) {
        warningMessage.textContent = 'অনুগ্রহ করে সেকশন এবং ইভ্যালুয়েশন উভয়ই নির্বাচন করুন।'; // Please select both section and evaluation.
        warningMessage.style.display = 'block';
        tableContainer.style.display = 'none';
        return;
    }

    warningMessage.style.display = 'none';
    const currentYear = new Date().getFullYear();

    try {
        const response = await fetch(`/api/students/${currentYear}/${section}`);
        const students = await response.json();

        if (!students || students.length === 0) {
            warningMessage.textContent = `এই শিক্ষাবর্ষে (${currentYear}) সেকশন '${section}'-এর জন্য কোনো ছাত্রছাত্রীর তালিকা পাওয়া যায়নি। অ্যাডমিনকে তালিকা আপলোড করতে বলুন।`;
            warningMessage.style.display = 'block';
            tableContainer.style.display = 'none';
            return;
        }

        populateMarksEntryTable(students, section, evolution, currentYear);

    } catch (error) {
        console.error('Error fetching student list:', error);
        warningMessage.textContent = 'ছাত্রছাত্রীদের তালিকা লোড করতে সমস্যা হয়েছে।';
        warningMessage.style.display = 'block';
    }
}

/**
 * ছাত্রছাত্রীদের তালিকা দিয়ে মার্কস এন্ট্রি টেবিলটি তৈরি করে।
 * @param {Array} students - ছাত্রছাত্রীদের তালিকা।
 * @param {string} section - নির্বাচিত সেকশন।
 * @param {string} evolution - নির্বাচিত ইভ্যালুয়েশন।
 */
async function populateMarksEntryTable(students, section, evolution, year) {
    const tableBody = document.getElementById('students-list-body');
    const tableHeader = document.getElementById('table-header');
    const writtenHeader = document.getElementById('written-header');
    const practicalHeader = document.getElementById('practical-header');
    const tableContainer = document.getElementById('marks-entry-table-container');
    tableBody.innerHTML = '';

    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    let savedMarksData = { status: 'new', data: {} };
    try {
        const response = await fetch(`/api/marks/${year}/${section}/${loggedInUser.subject}/${evolution}`);
        savedMarksData = await response.json();
    } catch (error) {
        console.error("Could not fetch existing marks:", error);
    }

    const isLocked = savedMarksData.status === 'submitted';

    // Show/hide buttons based on status
    document.getElementById('saveDraftBtn').style.display = isLocked ? 'none' : 'inline-block';
    document.querySelector('button[type="submit"]').style.display = isLocked ? 'none' : 'inline-block';
    document.getElementById('unlockBtn').style.display = isLocked ? 'inline-block' : 'none';

    // ইভ্যালুয়েশন অনুযায়ী ফুল মার্কস নির্ধারণ
    const fullMarks = {
        written: (evolution === '3') ? 90 : 40,
        practical: 10
    };

    // টেবিলের হেডার আপডেট করা
    tableHeader.textContent = `সেকশন: ${section} | ইভ্যালুয়েশন: ${evolution} | বিষয়: ${JSON.parse(sessionStorage.getItem('loggedInUser')).subject}`;
    writtenHeader.textContent = `Written (F.M. ${fullMarks.written})`;
    practicalHeader.textContent = `Practical (F.M. ${fullMarks.practical})`;

    // ছাত্রছাত্রীদের জন্য টেবিলের সারি তৈরি করা
    students.forEach(student => {
        const studentMarks = savedMarksData.data[student.Roll] || {};
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${student.Roll}</td>
            <td>${student.Name}</td>
            <td><input type="number" class="marks-input" data-type="written" data-roll="${student.Roll}" min="0" max="${fullMarks.written}" 
                value="${studentMarks.written || ''}" ${isLocked ? 'readonly' : ''}></td>
            <td><input type="number" class="marks-input" data-type="practical" data-roll="${student.Roll}" min="0" max="${fullMarks.practical}" 
                value="${studentMarks.practical || ''}" ${isLocked ? 'readonly' : ''}></td>
        `;
        tableBody.appendChild(row);
    });

    // টেবিলটি দেখানো
    tableContainer.style.display = 'block';

    // ইনপুট ভ্যালিডেশনের জন্য ইভেন্ট লিসেনার যোগ করা
    addInputValidation(fullMarks);
}

/**
 * মার্কস ইনপুট ফিল্ডে ভ্যালিডেশন যোগ করে।
 * @param {object} fullMarks - Written এবং Practical-এর ফুল মার্কস।
 */
function addInputValidation(fullMarks) {
    const inputs = document.querySelectorAll('.marks-input');
    const warningMessage = document.getElementById('warning-message');

    inputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            const type = e.target.dataset.type;
            const maxMarks = (type === 'written') ? fullMarks.written : fullMarks.practical;

            if (value > maxMarks) {
                warningMessage.textContent = `ভুল ইনপুট! সর্বোচ্চ নম্বর ${maxMarks}-এর বেশি হতে পারে না।`;
                warningMessage.style.display = 'block';
                e.target.value = '00'; // ব্যবহারকারীর নির্দেশ অনুযায়ী 00 করা হলো
                e.target.style.backgroundColor = '#ffe6e6'; // ভুল বোঝানোর জন্য রঙ পরিবর্তন

                // কিছুক্ষণ পর সতর্কবার্তা ও রঙ স্বাভাবিক করা
                setTimeout(() => {
                    warningMessage.style.display = 'none';
                    e.target.style.backgroundColor = '';
                }, 3000);
            } else if (value < 0) {
                e.target.value = '0';
            }
        });
    });
}

/**
 * Saves marks as a draft or submits them.
 * @param {'draft' | 'submitted'} status - The status to save the marks with.
 */
async function saveOrSubmitMarks(status) {
    const warningMessage = document.getElementById('warning-message');
    const section = document.getElementById('section').value;
    const evolution = document.getElementById('evolution').value;
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const subject = loggedInUser.subject;
    const currentYear = new Date().getFullYear();

    const marksPayload = { status: status, data: {} };
    const inputs = document.querySelectorAll('.marks-input');
    let allFilled = true;

    inputs.forEach(input => {
        const roll = input.dataset.roll;
        const type = input.dataset.type;
        if (!marksPayload.data[roll]) {
            marksPayload.data[roll] = {};
        }
        if (input.value === '') {
            allFilled = false;
        }
        marksPayload.data[roll][type] = input.value || '00';
    });

    if (status === 'submitted' && !allFilled) {
        if (!confirm('কিছু ছাত্রছাত্রীর নম্বর দেওয়া হয়নি। আপনি কি এই অবস্থাতেই সাবমিট করতে চান?')) {
            return;
        }
    }

    try {
        const response = await fetch('/api/marks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year: currentYear, section, subject, evolution, marksPayload })
        });

        if (!response.ok) throw new Error('সার্ভারে সেভ করা যায়নি।');

        const message = status === 'draft' ? 'নম্বর ড্রাফট হিসাবে সেভ করা হয়েছে।' : 'নম্বর সফলভাবে সাবমিট করা হয়েছে! ডেটা এখন লকড।';
        warningMessage.textContent = message;
        warningMessage.style.color = 'green';
        warningMessage.style.backgroundColor = '#e6ffed';
        warningMessage.style.display = 'block';

        setTimeout(() => { warningMessage.style.display = 'none'; }, 5000);

        if (status === 'submitted') {
            loadStudentListForMarksEntry();
        }
    } catch (error) {
        warningMessage.textContent = `ত্রুটি: ${error.message}`;
        warningMessage.style.color = 'red';
        warningMessage.style.display = 'block';
    }
}

/**
 * Sends an unlock request to the admin.
 */
async function requestUnlock() {
    if (!confirm('আপনি কি সত্যিই এই মার্কশিট আনলক করার জন্য অ্যাডমিনের কাছে অনুরোধ পাঠাতে চান?')) {
        return;
    }

    const section = document.getElementById('section').value;
    const evolution = document.getElementById('evolution').value;
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const currentYear = new Date().getFullYear();

    const requestPayload = {
        teacherName: loggedInUser.fullName,
        subject: loggedInUser.subject,
        section, evolution, year: currentYear,
        status: 'pending'
    };

    try {
        const response = await fetch('/api/unlock-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert(result.message);
    } catch (error) {
        alert(`ত্রুটি: ${error.message}`);
    }
}

async function updateMarksStatus(section, evolution, newStatus) {
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const currentYear = new Date().getFullYear();
    const subject = loggedInUser.subject;

    try {
        // First, get the current marks data
        const res = await fetch(`/api/marks/${currentYear}/${section}/${subject}/${evolution}`);
        const marksPayload = await res.json();
        
        // Update status
        marksPayload.status = newStatus;

        // Post it back
        await fetch('/api/marks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year: currentYear, section, subject, evolution, marksPayload })
        });
    } catch (error) {
        console.error("Failed to update marks status:", error);
    }
}

/**
 * Loads unlock notifications for the teacher.
 */
async function loadNotifications() {
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const allRequests = await (await fetch('/api/unlock-requests')).json();
    const approvedRequests = allRequests.filter(req => 
        req.subject === loggedInUser.subject && 
        req.teacherName === loggedInUser.fullName && 
        req.status === 'approved'
    );

    const badge = document.getElementById('notification-badge');
    const dropdown = document.getElementById('notification-dropdown');
    dropdown.innerHTML = '';

    if (approvedRequests.length > 0) {
        badge.textContent = approvedRequests.length;
        badge.style.display = 'block';

        approvedRequests.forEach(req => {
            const item = document.createElement('a');
            item.href = '#';
            item.className = 'notification-item';
            item.textContent = `অনুমোদন: সেকশন ${req.section}, ইভ্যালুয়েশন ${req.evolution} আনলক করা হয়েছে।`;
            item.dataset.requestId = req.id;
            item.dataset.section = req.section;
            item.dataset.evolution = req.evolution;
            item.addEventListener('click', handleNotificationClick);
            dropdown.appendChild(item);
        });
    } else {
        badge.style.display = 'none';
        dropdown.innerHTML = '<a href="#" style="text-align: center; cursor: default;">কোনো নতুন নোটিফিকেশন নেই।</a>';
    }
}

/**
 * Handles click on a notification item.
 * @param {Event} e The click event.
 */
async function handleNotificationClick(e) {
    e.preventDefault();
    const { requestId, section, evolution } = e.target.dataset;

    // Update status to make it editable
    await updateMarksStatus(section, evolution, 'draft');

    // Remove the request from server
    try {
        await fetch(`/api/unlock-requests/${requestId}`, { method: 'DELETE' });
        alert(`মার্কশিট (সেকশন: ${section}, ইভ্যালুয়েশন: ${evolution}) এখন সম্পাদনার জন্য আনলক করা হয়েছে।`);
        
        // Reload notifications and the table view
        loadNotifications();
        document.getElementById('section').value = section;
        document.getElementById('evolution').value = evolution;
        loadStudentListForMarksEntry();
    } catch (error) {
        alert('নোটিফিকেশন মুছতে সমস্যা হয়েছে।');
    }
}