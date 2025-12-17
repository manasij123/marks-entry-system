require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const crypto = require('crypto'); // For generating tokens
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app); // Create HTTP server from Express app
const PORT = 3000;

// --- MongoDB Connection ---
const client = new MongoClient(process.env.DB_URI);
let db;
let adminSessionToken = null; // In-memory token for single admin session
let adminWs = null; // To hold the active admin WebSocket connection


async function connectToDb() {
    try {
        await client.connect();
        db = client.db(process.env.DB_NAME);
        console.log("Successfully connected to MongoDB Atlas!");
    } catch (error) {
        console.error("Could not connect to DB", error);
        process.exit(1);
    }
}
// --- End of MongoDB Connection ---

// Middleware
app.use(cors());
app.set('trust proxy', true); // Necessary to get correct IP address if behind a proxy
app.use(express.json());

// --- Serve Static Files ---
// এই অংশটি আপনার সার্ভারকে HTML, CSS, এবং JS ফাইলগুলো হোস্ট করতে সাহায্য করবে।
app.use(express.static(__dirname));

// --- Serve HTML Pages ---
// প্রতিটি পেজের জন্য নির্দিষ্ট রুট তৈরি করা হচ্ছে
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});
app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});
app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});
app.get('/admin_dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin_dashboard.html'));
});

/**
 * API Endpoint: Teacher Registration
 */
app.post('/api/register', async (req, res) => {
    const { fullName, subject, password } = req.body;
    if (!fullName || !subject || !password) {
        return res.status(400).json({ message: 'অনুগ্রহ করে সমস্ত ঘর পূরণ করুন।' });
    }

    try {
        // --- Unique ID generation logic with MongoDB counter ---
        const counters = db.collection('counters');
        const sequence = await counters.findOneAndUpdate(
            { _id: `teacher_${subject}` },
            { $inc: { seq: 1 } },
            { returnDocument: 'after', upsert: true }
        );
        const serial = sequence.seq;

        const nameParts = fullName.split(' ').filter(part => part);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
        const fnPart = firstName.slice(0, 2).toUpperCase();
        const lnPart = lastName.slice(0, 2).toUpperCase();
        const uniqueId = `${fnPart}${lnPart}_${subject}_${serial}`;
        // --- End of Unique ID logic ---

        const teachers = db.collection('teachers');
        const existingTeacher = await teachers.findOne({ _id: uniqueId });
        if (existingTeacher) {
            return res.status(409).json({ message: 'এই ব্যবহারকারী ইতিমধ্যে বিদ্যমান।' });
        }

        await teachers.insertOne({ _id: uniqueId, fullName, subject, password: password });

        console.log(`New teacher registered: ${fullName} (${uniqueId})`);
        res.status(201).json({ message: 'রেজিস্ট্রেশন সফল হয়েছে!', uniqueId });
    } catch (error) {
        res.status(500).json({ message: 'সার্ভারে ত্রুটি দেখা দিয়েছে।' });
    }
});

/**
 * API Endpoint: Teacher & Admin Login
 */
app.post('/api/login', async (req, res) => {
    const { uniqueId, password } = req.body;
    const currentYear = new Date().getFullYear();

    if (uniqueId === 'cl_admin' && password === `Admin@${currentYear}`) {
        // Single session check for admin
        if (adminSessionToken) {
            // If an admin is already logged in, notify them via WebSocket
            if (adminWs) {
                try {
                    adminWs.send(JSON.stringify({
                        type: 'LOGIN_ATTEMPT',
                        ip: req.ip // Get IP address from the request
                    }));
                } catch (e) {
                    console.error("Failed to send login attempt notification via WebSocket.", e);
                }
            }
            return res.status(409).json({ success: false, message: 'অ্যাডমিন অন্য একটি ডিভাইসে লগইন অবস্থায় আছেন।' });
        }

        // Generate and store session token
        adminSessionToken = crypto.randomBytes(32).toString('hex');
        console.log('Admin logged in.'); // Log can remain in English
        // Send token to client
        return res.json({ success: true, isAdmin: true, user: { uniqueId: 'cl_admin', fullName: 'শ্রেণী শিক্ষিকা (অ্যাডমিন)', isAdmin: true, sessionToken: adminSessionToken } });
    }

    try {
        const teachers = db.collection('teachers');
        const teacher = await teachers.findOne({ _id: uniqueId });

        // Compare the provided password with the stored plain text password
        if (teacher && teacher.password === password) {
            console.log(`Teacher logged in: ${teacher.fullName}`);
            return res.json({ success: true, isAdmin: false, user: { uniqueId: teacher._id, fullName: teacher.fullName, subject: teacher.subject } });
        }
        res.status(401).json({ success: false, message: 'ভুল ইউনিক আইডি বা পাসওয়ার্ড।' });
    } catch (error) {
        res.status(500).json({ message: 'সার্ভারে ত্রুটি দেখা দিয়েছে।' });
    }
});

/**
 * API Endpoint: Admin Logout (clears session token)
 */
app.post('/api/admin/logout', (req, res) => {
    // This is a simple in-memory logout.
    // In a real app, you might want to verify the token being cleared.
    adminSessionToken = null;
    console.log('Admin session token cleared.');
    res.status(200).json({ success: true });
});

/**
 * API Endpoint: Add/Update Students for a year and section
 */
app.post('/api/students', async (req, res) => {
    const { year, section, students } = req.body;
    if (!year || !section || !students || !Array.isArray(students)) {
        return res.status(400).json({ message: 'অবৈধ অনুরোধ।' });
    }
    try {
        const studentsCollection = db.collection('students');
        await studentsCollection.updateOne(
            { year: parseInt(year), section: section },
            { $set: { students: students } },
            { upsert: true }
        );
        console.log(`Students updated for ${year}, Section ${section}.`);
        res.status(200).json({ message: `সফলভাবে ${students.length} জন ছাত্রীর তথ্য যোগ করা হয়েছে।` });
    } catch (error) {
        res.status(500).json({ message: 'সার্ভারে ত্রুটি দেখা দিয়েছে।' });
    }
});

/**
 * API Endpoint: Get students for a year and section
 */
app.get('/api/students/:year/:section', async (req, res) => {
    const { year, section } = req.params;
    try {
        const studentsCollection = db.collection('students');
        const result = await studentsCollection.findOne({ year: parseInt(year), section: section });
        res.json(result ? result.students : []);
    } catch (error) {
        res.status(500).json({ message: 'সার্ভারে ত্রুটি দেখা দিয়েছে।' });
    }
});

/**
 * API Endpoint: Get all teachers
 */
app.get('/api/teachers', async (req, res) => {
    try {
        const teachersArray = await db.collection('teachers').find({}).toArray();
        res.json(teachersArray); // Send as an array
    } catch (error) {
        res.status(500).json({ message: 'সার্ভারে ত্রুটি দেখা দিয়েছে।' });
    }
});

/**
 * API Endpoint: Get all unique subjects
 */
app.get('/api/subjects', async (req, res) => {
    try {
        const subjects = await db.collection('teachers').distinct('subject');
        res.json(subjects.sort()); // Sort subjects alphabetically
    } catch (error) {
        res.status(500).json({ message: 'সার্ভারে ত্রুটি দেখা দিয়েছে।' });
    }
});

/**
 * API Endpoint: Save or Submit Marks
 */
app.post('/api/marks', async (req, res) => {
    const { year, section, subject, evolution, marksPayload } = req.body;
    if (!year || !section || !subject || !evolution || !marksPayload) {
        return res.status(400).json({ message: 'অবৈধ অনুরোধ।' });
    }
    try {
        const marksCollection = db.collection('marks');
        await marksCollection.updateOne(
            { year: parseInt(year), section, subject, evolution },
            { $set: { status: marksPayload.status, data: marksPayload.data } },
            { upsert: true }
        );
        res.status(200).json({ message: 'নম্বর সফলভাবে সেভ করা হয়েছে।' });
    } catch (error) {
        console.error("Error saving marks:", error);
        res.status(500).json({ message: 'সার্ভারে ত্রুটি দেখা দিয়েছে।' });
    }
});

/**
 * API Endpoint: Get Marks for a specific sheet
 */
app.get('/api/marks/:year/:section/:subject/:evolution', async (req, res) => {
    const { year, section, subject, evolution } = req.params;
    try {
        const marksCollection = db.collection('marks');
        const result = await marksCollection.findOne({ year: parseInt(year), section, subject, evolution });
        res.json(result || { status: 'new', data: {} });
    } catch (error) {
        res.status(500).json({ message: 'সার্ভারে ত্রুটি দেখা দিয়েছে।' });
    }
});

/**
 * API Endpoint: Get all marks for a section (Consolidated)
 */
app.get('/api/marks/consolidated/:year/:section', async (req, res) => {
    const { year, section } = req.params;
    try {
        const marksArray = await db.collection('marks').find({ year: parseInt(year), section }).toArray();
        const consolidated = {};
        marksArray.forEach(markSheet => {
            const key = `marks_${markSheet.year}_${markSheet.section}_${markSheet.subject}_${markSheet.evolution}`;
            consolidated[key] = markSheet;
        });
        res.json(consolidated);
    } catch (error) {
        console.error("Error fetching consolidated marks:", error);
        res.status(500).json({ message: 'সার্ভারে ত্রুটি দেখা দিয়েছে।' });
    }
});

/**
 * API Endpoints for Unlock Requests
 */
app.get('/api/unlock-requests', async (req, res) => {
    const requests = await db.collection('unlockRequests').find({}).toArray();
    res.json(requests.map(r => ({...r, id: r._id.toString() }))); // Convert ObjectId to string for frontend
});

app.post('/api/unlock-requests', async (req, res) => {
    const newRequest = req.body;
    const existing = await db.collection('unlockRequests').findOne({
        teacherName: newRequest.teacherName,
        subject: newRequest.subject,
        section: newRequest.section,
        evolution: newRequest.evolution,
        year: newRequest.year,
        status: 'pending'
    });
    if (existing) {
        return res.status(409).json({ message: 'ইতিমধ্যেই একটি আনলক অনুরোধ পাঠানো হয়েছে।' });
    }
    await db.collection('unlockRequests').insertOne(newRequest);
    res.status(201).json({ message: 'আপনার অনুরোধ অ্যাডমিনের কাছে পাঠানো হয়েছে।' });
});

app.put('/api/unlock-requests/:id/approve', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.collection('unlockRequests').updateOne({ _id: new ObjectId(id) }, { $set: { status: 'approved' } });
        if (result.modifiedCount > 0) {
            res.json({ message: 'অনুরোধ অনুমোদিত হয়েছে।' });
        } else {
            res.status(404).json({ message: 'অনুরোধটি খুঁজে পাওয়া যায়নি।' });
        }
    } catch (error) {
        res.status(400).json({ message: 'অবৈধ অনুরোধ আইডি।' });
    }
});

app.delete('/api/unlock-requests/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.collection('unlockRequests').deleteOne({ _id: new ObjectId(id) });
        res.status(200).json({ message: 'নোটিফিকেশন মুছে ফেলা হয়েছে।' });
    } catch (error) {
        res.status(400).json({ message: 'অবৈধ অনুরোধ আইডি।' });
    }
});

/**
 * API Endpoints for Teacher Management
 */
app.delete('/api/teachers/:id', async (req, res) => {
    const { id } = req.params;
    const result = await db.collection('teachers').deleteOne({ _id: id });
    if (result.deletedCount > 0) {
        res.json({ message: 'শিক্ষিকাকে সফলভাবে ডিলিট করা হয়েছে।' });
    } else {
        res.status(404).json({ message: 'শিক্ষিকাকে খুঁজে পাওয়া যায়নি।' });
    }
});

app.put('/api/teachers/:id/reset-password', async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'পাসওয়ার্ড খালি রাখা যাবে না।' });

    const result = await db.collection('teachers').updateOne({ _id: id }, { $set: { password: password } });
    if (result.modifiedCount > 0) {
        res.json({ message: 'অনুরোধ অনুমোদিত হয়েছে।' });
    } else {
        res.status(404).json({ message: 'অনুরোধটি খুঁজে পাওয়া যায়নি।' });
    }
});

// Start the server
connectToDb();

// --- WebSocket Server Setup ---
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    // Check if the connection is from a logged-in admin
    // A simple way is to check a query parameter on connection
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (token && token === adminSessionToken) {
        console.log('Admin connected via WebSocket.');
        adminWs = ws;

        ws.on('close', () => {
            console.log('Admin WebSocket connection closed.');
            adminWs = null; // Clear the connection when closed
        });
    }
});

server.listen(PORT, () => {
    console.log(`সার্ভার http://localhost:${PORT} -এ চলছে`);
});