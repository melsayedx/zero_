/**
 * MongoDB Repository Implementation
 * For future dashboard/user data storage
 * Currently unused - prepared for Phase 2
 */

class MongoDBRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Save dashboard configuration
   * @param {Object} dashboard 
   */
  async saveDashboard(dashboard) {
    const collection = this.db.collection('dashboards');
    return await collection.insertOne(dashboard);
  }

  /**
   * Find dashboard by ID
   * @param {string} id 
   */
  async findDashboard(id) {
    const collection = this.db.collection('dashboards');
    return await collection.findOne({ _id: id });
  }

  /**
   * List all dashboards
   */
  async listDashboards() {
    const collection = this.db.collection('dashboards');
    return await collection.find({}).toArray();
  }
}

module.exports = MongoDBRepository;

