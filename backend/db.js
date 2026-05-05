/**
 * db.js — Pure-JS JSON database using lowdb v1 (no native compilation needed)
 * Data is persisted to ./conversations.json
 */
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const path = require("path");

const adapter = new FileSync(path.join(__dirname, "conversations.json"));
const db = low(adapter);

// Set defaults (schema)
db.defaults({ conversations: [] }).write();

module.exports = {
  /**
   * Insert a new conversation record
   */
  insertConversation(data) {
    db.get("conversations")
      .push({
        id: data.id,
        from_number: data.from_number,
        message: data.message,
        structured_json: data.structured_json,
        raw_llm_response: data.raw_llm_response || null,
        timestamp: data.timestamp,
        intent: data.intent || null,
        confidence: data.confidence || null,
        created_at: Date.now(),
      })
      .write();
    return { changes: 1 };
  },

  /**
   * Get all conversations (newest first), with optional pagination
   */
  getAllConversations(limit = 100, offset = 0) {
    return db
      .get("conversations")
      .orderBy(["created_at"], ["desc"])
      .slice(offset, offset + limit)
      .value();
  },

  /**
   * Get a single conversation by ID
   */
  getConversationById(id) {
    return db.get("conversations").find({ id }).value() || null;
  },

  /**
   * Get conversations by phone number (newest first)
   */
  getConversationsByNumber(from_number, limit = 50) {
    return db
      .get("conversations")
      .filter({ from_number })
      .orderBy(["created_at"], ["desc"])
      .slice(0, limit)
      .value();
  },

  /**
   * Delete a conversation by ID
   */
  deleteConversation(id) {
    const before = db.get("conversations").size().value();
    db.get("conversations").remove({ id }).write();
    const after = db.get("conversations").size().value();
    return { changes: before - after };
  },

  /**
   * Update conversation structured_json by ID
   */
  updateConversationJson(id, structuredJson) {
    db.get("conversations")
      .find({ id })
      .assign({ structured_json: structuredJson })
      .write();
    return { changes: 1 };
  },

  /**
   * Get stats summary
   */
  getStats() {
    const all = db.get("conversations").value();
    const total = all.length;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const last_hour = all.filter((c) => c.created_at > oneHourAgo).length;

    // Group by intent
    const intentMap = {};
    all.forEach((c) => {
      if (c.intent) {
        intentMap[c.intent] = (intentMap[c.intent] || 0) + 1;
      }
    });
    const by_intent = Object.entries(intentMap)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count);

    return { total, last_hour, by_intent };
  },
};
