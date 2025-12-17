document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');

    // রেজিস্ট্রেশন পেজের জন্য লজিক
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fullName = document.getElementById('fullName').value.trim();
            const subject = document.getElementById('subject').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName, subject, password })
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.message);
                }

                // রেজিস্ট্রেশন সফল হলে
                const { uniqueId } = result;
                showUniqueIdPopup(uniqueId);

                // ৬০ সেকেন্ড পর অটো-লগইন করে ড্যাশবোর্ডে পাঠানো
                setTimeout(() => {
                    sessionStorage.setItem('loggedInUser', JSON.stringify({ uniqueId, fullName, subject }));
                    window.location.href = 'dashboard.html';
                }, 60000);

            } catch (error) {
                alert(`রেজিস্ট্রেশন ব্যর্থ হয়েছে: ${error.message}`);
            }
        });
    }

    // লগইন পেজের জন্য লজিক
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const uniqueId = document.getElementById('uniqueId').value.trim();
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uniqueId, password })
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.message);
                }

                // লগইন সফল হলে
                alert('লগইন সফল হয়েছে!');
                sessionStorage.setItem('loggedInUser', JSON.stringify(result.user));

                if (result.isAdmin) {
                    window.location.href = 'admin_dashboard.html';
                } else {
                    window.location.href = 'dashboard.html';
                }

            } catch (error) {
                alert(`লগইন ব্যর্থ হয়েছে: ${error.message}`);
            }
        });
    }
});

/**
 * রেজিস্ট্রেশনের পর ইউনিক আইডি দেখানোর জন্য পপ-আপ ফাংশন।
 * @param {string} uniqueId - জেনারেট করা ইউনিক আইডি।
 */
function showUniqueIdPopup(uniqueId) {
    const popup = document.getElementById('uniqueIdPopup');
    const generatedIdElem = document.getElementById('generatedId');
    const countdownElem = document.getElementById('countdown');

    if (!popup || !generatedIdElem || !countdownElem) return;

    generatedIdElem.textContent = uniqueId;
    popup.style.display = 'flex';

    let seconds = 60;
    countdownElem.textContent = seconds;

    const interval = setInterval(() => {
        seconds--;
        countdownElem.textContent = seconds;
        if (seconds <= 0) {
            clearInterval(interval);
            popup.style.display = 'none';
        }
    }, 1000);
}

/**
 * লগআউট ফাংশন
 */
function logout() {
    if (confirm('আপনি কি সত্যিই লগআউট করতে চান?')) {
        const user = JSON.parse(sessionStorage.getItem('loggedInUser'));

        // If the user is an admin, notify the server to clear the session
        if (user && user.isAdmin) {
            fetch('/api/admin/logout', { method: 'POST', keepalive: true });
        }

        sessionStorage.removeItem('loggedInUser');
        alert('আপনি সফলভাবে লগআউট করেছেন।');
        window.location.href = 'login.html';
    }
}

/**
 * ব্যবহারকারী লগইন করা আছে কিনা তা পরীক্ষা করে।
 * ড্যাশবোর্ড পেজগুলোকে সুরক্ষিত রাখার জন্য এটি ব্যবহার করা হবে।
 */
function checkAuth() {
    const loggedInUser = sessionStorage.getItem('loggedInUser');
    // যদি ব্যবহারকারী লগইন না করে থাকে এবং সুরক্ষিত পেজে অ্যাক্সেস করার চেষ্টা করে
    if (!loggedInUser) {
        // login.html ছাড়া অন্য কোনো পেজে থাকলে তাকে লগইন পেজে পাঠিয়ে দেওয়া হবে
        if (!window.location.pathname.endsWith('login.html') && !window.location.pathname.endsWith('register.html')) {
            window.location.href = 'login.html';
        }
    }
}