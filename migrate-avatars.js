const { sequelize } = require('./index');

async function migrate() {
  try {
    await sequelize.query('ALTER TABLE Users ADD COLUMN avatar TEXT;');
    console.log('Avatar column added to Users table');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await sequelize.close();
  }
}

migrate();