/**
 * MongoDB Setup Script
 * Initialize MongoDB collections and indexes
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/observability_platform';

async function setupMongoDB() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // Create collections if they don't exist
    console.log('\nCreating collections...');
    
    const collections = ['users', 'dashboards', 'alerts', 'schemas', 'sessions'];
    
    for (const collectionName of collections) {
      try {
        await db.createCollection(collectionName);
        console.log(`✓ Collection created: ${collectionName}`);
      } catch (error) {
        if (error.code === 48) {
          console.log(`✓ Collection already exists: ${collectionName}`);
        } else {
          throw error;
        }
      }
    }

    // Create indexes
    console.log('\nCreating indexes...');

    // Users indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('users').createIndex({ 'apiKeys.key': 1 });
    console.log('✓ Users indexes created');

    // Dashboards indexes
    await db.collection('dashboards').createIndex({ owner: 1, createdAt: -1 });
    await db.collection('dashboards').createIndex({ name: 'text', description: 'text' });
    await db.collection('dashboards').createIndex({ tags: 1 });
    await db.collection('dashboards').createIndex({ isPublic: 1 });
    console.log('✓ Dashboards indexes created');

    // Alerts indexes
    await db.collection('alerts').createIndex({ owner: 1, createdAt: -1 });
    await db.collection('alerts').createIndex({ isEnabled: 1 });
    await db.collection('alerts').createIndex({ 'condition.metric': 1 });
    await db.collection('alerts').createIndex({ lastTriggered: -1 });
    console.log('✓ Alerts indexes created');

    // Schemas indexes
    await db.collection('schemas').createIndex({ name: 1, version: 1 }, { unique: true });
    await db.collection('schemas').createIndex({ owner: 1 });
    await db.collection('schemas').createIndex({ services: 1 });
    await db.collection('schemas').createIndex({ isActive: 1 });
    console.log('✓ Schemas indexes created');

    // Create default admin user (if not exists)
    console.log('\nCreating default admin user...');
    const User = require('../src/models/mongodb/user.model');
    
    const existingAdmin = await User.findOne({ username: 'admin' });
    
    if (!existingAdmin) {
      const adminUser = new User({
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123', // Will be hashed by model
        role: 'admin',
        isActive: true
      });
      
      await adminUser.save();
      console.log('✓ Admin user created');
      console.log('  Username: admin');
      console.log('  Password: admin123');
      console.log('  ⚠️  CHANGE THIS PASSWORD IN PRODUCTION!');
    } else {
      console.log('✓ Admin user already exists');
    }

    console.log('\n✅ MongoDB setup completed successfully!');

  } catch (error) {
    console.error('❌ MongoDB setup failed:', error.message);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run setup
if (require.main === module) {
  setupMongoDB()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = setupMongoDB;

