document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in, otherwise redirect
    const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
    if (!user || user.isAdmin) {
        alert('এই পেজটি দেখার জন্য আপনার অনুমতি নেই।');
        window.location.href = 'login.html';
        return;
    }

    // Populate user info in the header
    document.getElementById('userFullName').textContent = user.fullName;
    document.getElementById('menuUserFullName').textContent = user.fullName;
    document.getElementById('menuUserSubject').textContent = user.subject;
    document.getElementById('menuUserId').textContent = user.uniqueId;

    // Event Listeners
    document.getElementById('loadStudentsBtn').addEventListener('click', loadMarksheet);
    document.getElementById('saveDraftBtn').addEventListener('click', () => saveOrSubmitMarks('draft'));
    document.getElementById('submitBtn').addEventListener('click', handleSubmitClick);
    document.getElementById('unlockBtn').addEventListener('click', handleUnlockRequest);

    // Initial setup
    checkAuth();
});

/**
 * Fetches students and their marks for the selected criteria.
 */
async function loadMarksheet() {
    const section = document.getElementById('section').value;
    const evolution = document.getElementById('evolution').value;
    const user = JSON.parse(sessionStorage.getItem('loggedInUser'));

    if (!section || !evolution) {
        alert('অনুগ্রহ করে সেকশন এবং ইভ্যালুয়েশন নির্বাচন করুন।');
        return;
    }

    const year = new Date().getFullYear(); // Or get from a dropdown if needed

    // Fetch students and marks data concurrently
    try {
        const [studentsRes, marksRes] = await Promise.all([
            fetch(`/api/students/${year}/${section}`),
            fetch(`/api/marks/${year}/${section}/${user.subject}/${evolution}`)
        ]);

        if (!studentsRes.ok || !marksRes.ok) {
            throw new Error('তথ্য আনতে সমস্যা হয়েছে।');
        }

        const students = await studentsRes.json();
        const marksheet = await marksRes.json();

        if (students.length === 0) {
            alert('এই সেকশনে কোনো ছাত্রী পাওয়া যায়নি।');
            return;
        }

        displayMarksTable(students, marksheet, { year, section, evolution, subject: user.subject });

    } catch (error) {
        console.error('Error loading marksheet:', error);
        alert(`একটি ত্রুটি ঘটেছে: ${error.message}`);
    }
}

/**
 * Renders the marks entry table and action buttons based on marksheet status.
 */
function displayMarksTable(students, marksheet, sheetInfo) {
    const tableContainer = document.getElementById('marks-entry-table-container');
    const tableBody = document.getElementById('students-list-body');
    const tableHeader = document.getElementById('table-header');
    const actionButtons = document.querySelector('.action-buttons');

    tableHeader.textContent = `${sheetInfo.subject} - ইভ্যালুয়েশন ${sheetInfo.evolution} - সেকশন ${sheetInfo.section}`;
    tableBody.innerHTML = ''; // Clear previous data

    students.sort((a, b) => a.roll - b.roll).forEach(student => {
        const marks = marksheet.data ? (marksheet.data[student.roll] || {}) : {};
        const row = tableBody.insertRow();
        row.innerHTML = `
            <td>${student.roll}</td>
            <td>${student.name}</td>
            <td><input type="number" class="mark-input" data-roll="${student.roll}" data-type="written" value="${marks.written || ''}" min="0" max="40"></td>
            <td><input type="number" class="mark-input" data-roll="${student.roll}" data-type="practical" value="${marks.practical || ''}" min="0" max="10"></td>
        `;
    });

    tableContainer.style.display = 'block';
    actionButtons.style.display = 'flex';

    updateUIForStatus(marksheet.status || 'draft');
}

/**
 * Updates buttons and inputs based on the marksheet status.
 */
function updateUIForStatus(status) {
    const inputs = document.querySelectorAll('.mark-input');
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    const submitBtn = document.getElementById('submitBtn');
    const unlockBtn = document.getElementById('unlockBtn');
    const statusDisplay = document.getElementById('marks-status-display');

    // Default state (editable)
    let isEditable = true;
    saveDraftBtn.style.display = 'inline-block';
    submitBtn.style.display = 'inline-block';
    unlockBtn.style.display = 'none';
    statusDisplay.style.display = 'inline-block';

    if (status === 'submitted') {
        isEditable = false;
        saveDraftBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        unlockBtn.style.display = 'inline-block';
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'আনলকের জন্য অনুরোধ করুন';
        statusDisplay.textContent = 'Status: Submitted';
        statusDisplay.className = 'status-badge submitted';
    } else if (status === 'pending_unlock') {
        isEditable = false;
        saveDraftBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        unlockBtn.style.display = 'inline-block';
        unlockBtn.disabled = true;
        unlockBtn.textContent = 'Unlock Requested';
        statusDisplay.textContent = 'Status: Pending Unlock';
        statusDisplay.className = 'status-badge pending';
    } else { // 'draft' or 'new'
        statusDisplay.textContent = 'Status: Draft';
        statusDisplay.className = 'status-badge draft';
    }

    inputs.forEach(input => input.disabled = !isEditable);
}

/**
 * Handles the click on the "Submit" button by showing a confirmation modal.
 */
function handleSubmitClick() {
    const modal = document.getElementById('confirmation-modal');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const closeBtn = modal.querySelector('.modal-close-btn');

    modal.style.display = 'flex';

    // Use .onclick to ensure we have only one listener
    confirmBtn.onclick = () => {
        saveOrSubmitMarks('submitted');
        modal.style.display = 'none';
    };
    cancelBtn.onclick = () => modal.style.display = 'none';
    closeBtn.onclick = () => modal.style.display = 'none';
}

/**
 * Collects marks from the table and sends them to the server.
 * @param {string} status - 'draft' or 'submitted'.
 */
async function saveOrSubmitMarks(status) {
    const section = document.getElementById('section').value;
    const evolution = document.getElementById('evolution').value;
    const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const year = new Date().getFullYear();

    const marksData = {};
    const inputs = document.querySelectorAll('.mark-input');
    inputs.forEach(input => {
        const roll = input.dataset.roll;
        const type = input.dataset.type;
        if (!marksData[roll]) {
            marksData[roll] = {};
        }
        marksData[roll][type] = input.value || null; // Store null if empty
    });

    const payload = {
        year,
        section,
        evolution,
        subject: user.subject,
        marksPayload: {
            status: status,
            data: marksData
        }
    };

    try {
        const response = await fetch('/api/marks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message);
        }

        const result = await response.json();
        alert(result.message);

        // Update UI based on the new status
        updateUIForStatus(status);

    } catch (error) {
        console.error('Error saving marks:', error);
        alert(`একটি ত্রুটি ঘটেছে: ${error.message}`);
    }
}

/**
 * Sends a request to the admin to unlock a submitted marksheet.
 */
async function handleUnlockRequest() {
    if (!confirm('আপনি কি নিশ্চিতভাবে এই মার্কশিটটি আনলক করার জন্য অনুরোধ করতে চান?')) {
        return;
    }

    const section = document.getElementById('section').value;
    const evolution = document.getElementById('evolution').value;
    const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const year = new Date().getFullYear();

    const payload = {
        teacherName: user.fullName,
        subject: user.subject,
        year: year,
        section: section,
        evolution: evolution,
        status: 'pending'
    };

    try {
        const response = await fetch('/api/unlock-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message);
        }

        const result = await response.json();
        alert(result.message);

        // Update the marksheet status to 'pending_unlock' on the server
        await saveOrSubmitMarks('pending_unlock');

    } catch (error) {
        console.error('Error requesting unlock:', error);
        alert(`একটি ত্রুটি ঘটেছে: ${error.message}`);
    }
}