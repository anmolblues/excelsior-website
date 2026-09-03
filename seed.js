// seed.js
// Run with: npm run seed
// Populates the data files with an admin account and some sample classes
// (based on the placeholder classes from the original page) so the site
// isn't empty when you first run it. Safe to re-run — it won't duplicate
// the admin account, but it WILL add another copy of the sample classes
// if you run it more than once, so only run it once (or clear data/classes.json first).

const bcrypt = require('bcryptjs');
const { readTable, writeTable, nextId } = require('./db');

// ---- Admin account ----
const ADMIN_EMAIL = 'admin@excelsiorenrichment.example';
const ADMIN_PASSWORD = 'ChangeMe123!'; // CHANGE THIS after first login

const users = readTable('users');
if (!users.find(u => u.email === ADMIN_EMAIL)) {
  users.push({
    id: nextId('users'),
    name: 'Site Admin',
    email: ADMIN_EMAIL,
    passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
    role: 'admin',
    createdAt: new Date().toISOString(),
  });
  writeTable('users', users);
  console.log(`Created admin account:\n  email: ${ADMIN_EMAIL}\n  password: ${ADMIN_PASSWORD}\n  (change this password after logging in!)`);
} else {
  console.log('Admin account already exists, skipping.');
}

// ---- Sample classes ----
const sampleClasses = [
  {
    title: 'Minecraft Redstone Engineering',
    description: 'Build amazing contraptions and learn real engineering concepts through Minecraft!',
    subject: 'Coding',
    ageMin: 8,
    ageMax: 11,
    format: 'online',
    price: 18,
    priceUnit: 'per class',
    schedule: 'Starts May 5 • Tuesdays',
    image: 'https://picsum.photos/id/237/400/240',
    capacity: 12,
    rating: 4.98,
  },
  {
    title: 'Creative Storybook Illustration',
    description: 'Write and illustrate your own picture book with professional artist guidance.',
    subject: 'Art',
    ageMin: 6,
    ageMax: 9,
    format: 'online',
    price: 22,
    priceUnit: 'per class',
    schedule: 'Wednesdays',
    image: 'https://picsum.photos/id/201/400/240',
    capacity: 10,
    rating: 4.95,
  },
  {
    title: 'Intro to Python Programming',
    description: 'Learn to code your own games and animations in this fun beginner course.',
    subject: 'Coding',
    ageMin: 10,
    ageMax: 14,
    format: 'online',
    price: 25,
    priceUnit: 'per class',
    schedule: 'May 6 • 4 weeks',
    image: 'https://picsum.photos/id/870/400/240',
    capacity: 15,
    rating: 5.0,
  },
  {
    title: 'Math Mad Lab',
    description: 'Get to know math in a fun, hands-on way through games and puzzles.',
    subject: 'Math',
    ageMin: 7,
    ageMax: 10,
    format: 'in-person',
    price: 20,
    priceUnit: 'per class',
    schedule: 'Live weekly • Thursdays',
    image: 'https://picsum.photos/id/1025/400/240',
    capacity: 8,
    rating: 4.92,
  },
  {
    title: 'Public Speaking Bootcamp',
    description: 'Build confidence speaking in front of others through fun games and exercises.',
    subject: 'Public Speaking',
    ageMin: 9,
    ageMax: 13,
    format: 'online',
    price: 19,
    priceUnit: 'per class',
    schedule: 'Mondays',
    image: 'https://picsum.photos/id/433/400/240',
    capacity: 12,
    rating: 4.9,
  },
  {
    title: 'Junior Debate Club',
    description: 'Learn to research, argue, and think on your feet in a friendly group setting.',
    subject: 'Debate',
    ageMin: 11,
    ageMax: 15,
    format: 'in-person',
    price: 24,
    priceUnit: 'per class',
    schedule: 'Fridays',
    image: 'https://picsum.photos/id/660/400/240',
    capacity: 10,
    rating: 4.97,
  },
];

const classes = readTable('classes');
if (classes.length === 0) {
  for (const c of sampleClasses) {
    classes.push({
      id: nextId('classes'),
      ...c,
      createdAt: new Date().toISOString(),
    });
  }
  writeTable('classes', classes);
  console.log(`Added ${sampleClasses.length} sample classes.`);
} else {
  console.log('Classes already exist, skipping sample data.');
}
