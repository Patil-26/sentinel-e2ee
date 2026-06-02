// frontend/src/lib/storage.js

// dynamically generate a unique database per user to simulate separate physical devices
const getDbName = (clientId) => `sentinel_local_db_${clientId}`;
const STORE_NAME = 'messages';

export const initDB = (clientId) => {
  return new Promise((resolve, reject) => {
    if (!clientId) return reject("No client ID provided");
    
    const request = indexedDB.open(getDbName(clientId), 1);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('chatId', 'chatId', { unique: false });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveMessage = async (clientId, chatId, messageData) => {
  const db = await initDB(clientId);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const msgToSave = { 
      chatId, 
      ...messageData, 
      savedAt: Date.now() 
    };
    
    const request = store.add(msgToSave);
    request.onsuccess = () => resolve({ id: request.result, ...msgToSave });
    request.onerror = () => reject(request.error);
  });
};

export const loadChatHistory = async (clientId, chatId) => {
  const db = await initDB(clientId);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('chatId');
    
    const request = index.getAll(chatId);
    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => a.savedAt - b.savedAt);
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getRecentContacts = async (clientId) => {
  const db = await initDB(clientId);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.getAll();
    request.onsuccess = () => {
      const allMsgs = request.result || [];
      const uniqueContacts = [...new Set(allMsgs.map(m => m.chatId))];
      resolve(uniqueContacts);
    };
    request.onerror = () => reject(request.error);
  });
};

export const clearAllData = async (clientId) => {
  const db = await initDB(clientId);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    
    request.onsuccess = () => {
      resolve(true);
    };
    request.onerror = () => reject(request.error);
  });
};