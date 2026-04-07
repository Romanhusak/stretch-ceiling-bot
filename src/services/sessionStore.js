const sessions = new Map();

function createEmptySession() {
  return {
    active: false,
    stepIndex: 0,
    answers: {},
    rooms: [],
    currentRoomNumber: 1,
    mode: 'idle',
    adminEditKey: null
  };
}

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, createEmptySession());
  }

  return sessions.get(chatId);
}

function resetSession(chatId) {
  const session = createEmptySession();
  sessions.set(chatId, session);
  return session;
}

function clearSession(chatId) {
  sessions.delete(chatId);
}

module.exports = {
  getSession,
  resetSession,
  clearSession
};
