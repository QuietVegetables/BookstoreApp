const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    host: 'tyg4xa.h.filess.io',
    port: 3307,
    user: 'C237database_structure',
    password: 'e73f388370e198a96e7777b8bf7b3a1516849323',
    database: 'C237database_structure'
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use(flash());

const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in to view this resource');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') return next();
    req.flash('error', 'Access denied');
    res.redirect('/shopping');
};

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;
    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

app.get('/admin', checkAuthenticated, checkAdmin, (req, res) => {
    connection.query('SELECT * FROM books', (error, results) => {
        if (error) throw error;
        res.render('admin', { books: results, user: req.session.user });
    });
});

app.get('/register', (req, res) => {
    res.render('register', {
        messages: req.flash('error'),
        formData: req.flash('formData')[0]
    });
});

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;
    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) throw err;
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }
    const sql = 'SELECT * FROM users WHERE username = ? AND password = SHA1(?)';
    connection.query(sql, [username, password], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            req.session.user = results[0];
            req.flash('success', 'Login successful!');
            if (req.session.user.role === 'admin') {
                res.redirect('/admin');
            } else {
                res.redirect('/shopping');
            }
        } else {
            req.flash('error', 'Invalid username or password.');
            res.redirect('/login');
        }
    });
});

app.get('/shopping', checkAuthenticated, (req, res) => {
    connection.query('SELECT * FROM books', (error, results) => {
        if (error) throw error;
        res.render('shopping', { user: req.session.user, books: results });
    });
});

app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const bookId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;
    connection.query('SELECT * FROM books WHERE bookId = ?', [bookId], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            const book = results[0];
            if (!req.session.cart) req.session.cart = [];
            const existingItem = req.session.cart.find(item => item.bookId === bookId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.cart.push({
                    bookId: book.bookId,
                    bookName: book.bookName,
                    price: book.price,
                    quantity: quantity,
                    image: book.image
                });
            }
            res.redirect('/cart');
        } else {
            res.status(404).send("Book not found");
        }
    });
});

app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/book/:id', checkAuthenticated, (req, res) => {
    const bookId = req.params.id;
    connection.query('SELECT * FROM books WHERE bookId = ?', [bookId], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            res.render('book', { book: results[0], user: req.session.user });
        } else {
            res.status(404).send('Book not found');
        }
    });
});

app.get('/addBook', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addBook', { user: req.session.user });
});

app.post('/addBook', upload.single('image'), (req, res) => {
    const { name, quantity, price } = req.body;
    let image = req.file ? req.file.filename : null;
    const sql = 'INSERT INTO books (bookName, quantity, price, image) VALUES (?, ?, ?, ?)';
    connection.query(sql, [name, quantity, price, image], (error, results) => {
        if (error) {
            console.error("Error adding book:", error);
            res.status(500).send('Error adding book');
        } else {
            res.redirect('/admin');
        }
    });
});

app.get('/books', checkAuthenticated, (req, res) => {
    const sql = "SELECT * FROM books";
    connection.query(sql, (err, results) => {
        if (err) return res.send('Error fetching books');
        res.render('books/list', { books: results, user: req.session.user });
    });
});

app.get('/books/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = "SELECT * FROM books WHERE bookId = ?";
    connection.query(sql, [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.send('Book not found');
        res.render('books/edit', { book: results[0], user: req.session.user });
    });
});

app.post('/books/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const { bookName, quantity, price, description } = req.body;
    const sql = UPDATE books SET bookName = ?, quantity = ?, price = ?, description = ? WHERE bookId = ?;
    const values = [bookName, quantity, price, description, req.params.id];

    connection.query(sql, values, (err) => {
        if (err) return res.send('Failed to update book');
        res.redirect('/books');
    });
});

app.get('/updateBook/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const bookId = req.params.id;
    connection.query('SELECT * FROM books WHERE bookId = ?', [bookId], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            res.render('updateBook', { book: results[0] });
        } else {
            res.status(404).send('Book not found');
        }
    });
});

app.post('/updateBook/:id', upload.single('image'), (req, res) => {
    const bookId = req.params.id;
    const { name, quantity, price } = req.body;
    let image = req.body.currentImage;
    if (req.file) image = req.file.filename;
    const sql = 'UPDATE books SET bookName = ?, quantity = ?, price = ?, image = ? WHERE bookId = ?';
    connection.query(sql, [name, quantity, price, image, bookId], (error, results) => {
        if (error) {
            console.error("Error updating book:", error);
            res.status(500).send('Error updating book');
        } else {
            res.redirect('/admin');
        }
    });
});

app.get('/deleteBook/:id', (req, res) => {
    const bookId = req.params.id;
    connection.query('DELETE FROM books WHERE bookId = ?', [bookId], (error, results) => {
        if (error) {
            console.error("Error deleting book:", error);
            res.status(500).send('Error deleting book');
        } else {
            res.redirect('/admin');
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
