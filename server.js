const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

const app = express();

// --- KONFIGURASI CLOUDINARY (GANTI INI!) ---
cloudinary.config({ 
  cloud_name: 'dft89wqew', 
  api_key: '134565788798277', 
  api_secret: 'd8xiQb-uubUqTGiUD8LPMT0eewg' 
});

app.use(express.json());
app.use(express.static('public'));

// --- DATABASE SEMENTARA (MEMORY) ---
// Catatan: Data akan reset jika Vercel redeploy/restart.
// Untuk permanen, harus konek ke MongoDB Atlas (tahap lanjut).
let db = { 
    users: [{ username: "syamsul", password: "ganteng", role: "admin" }], 
    projects: { "syamsul": {} } 
};

// Multer simpan di RAM (bukan Harddisk)
const upload = multer({ storage: multer.memoryStorage() });

// --- ROUTES AUTH ---
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (db.users.find(u => u.username === username)) return res.json({ success: false, message: "Username ada!" });
    db.users.push({ username, password, role: 'user' });
    db.projects[username] = {};
    res.json({ success: true });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) res.json({ success: true, user: { username: user.username, role: user.role } });
    else res.json({ success: false, message: "Gagal" });
});

// --- ROUTES DATA ---
app.get('/api/projects/list/:username/:role', (req, res) => {
    const { username, role } = req.params;
    let list = [];
    if (role === 'admin') {
        Object.keys(db.projects).forEach(own => {
            Object.keys(db.projects[own]).forEach(p => list.push({ owner: own, name: p }));
        });
    } else {
        const myP = db.projects[username] || {};
        list = Object.keys(myP).map(k => ({ owner: username, name: k }));
    }
    res.json(list);
});

app.post('/api/project/create', (req, res) => {
    const { username, projectName } = req.body;
    if (!db.projects[username]) db.projects[username] = {};
    if (!db.projects[username][projectName]) {
        db.projects[username][projectName] = [];
        res.json({ success: true });
    } else res.json({ success: false, message: "Sudah ada" });
});

app.get('/api/project/photos/:owner/:project', (req, res) => {
    const { owner, project } = req.params;
    res.json(db.projects[owner]?.[project] || []);
});

app.post('/api/photo/delete', (req, res) => {
    const { username, project, filename } = req.body;
    if (!db.projects[username]?.[project]) return res.json({ success: false });
    const photos = db.projects[username][project];
    const index = photos.findIndex(p => p.filename === filename);
    if (index !== -1) {
        // Hapus dari memory list
        photos.splice(index, 1);
        // Note: Foto di Cloudinary tidak dihapus di versi simple ini
        res.json({ success: true });
    } else res.json({ success: false });
});

// --- UPLOAD KE CLOUDINARY ---
app.post('/api/upload', upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    const { username, project, manualLat, manualLng } = req.body;

    // Helper untuk upload buffer ke Cloudinary
    let streamUpload = (req) => {
        return new Promise((resolve, reject) => {
            let stream = cloudinary.uploader.upload_stream(
                { folder: `geo-app/${username}/${project}` },
                (error, result) => {
                    if (result) resolve(result);
                    else reject(error);
                }
            );
            streamifier.createReadStream(req.file.buffer).pipe(stream);
        });
    };

    async function upload() {
        try {
            let result = await streamUpload(req);
            
            // Simpan URL Cloudinary ke Database Memory
            const photoData = {
                filename: req.file.originalname,
                path: result.secure_url, // Ini URL HTTPS dari Cloudinary
                lat: manualLat ? parseFloat(manualLat) : null,
                lng: manualLng ? parseFloat(manualLng) : null,
                date: new Date().toLocaleString()
            };

            if(!db.projects[username]) db.projects[username] = {};
            if(!db.projects[username][project]) db.projects[username][project] = [];
            
            db.projects[username][project].push(photoData);
            res.json({ success: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false });
        }
    }
    upload();
});

// Export app untuk Vercel
module.exports = app;
