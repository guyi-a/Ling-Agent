const DB_NAME = 'ling-pending-files'
const STORE_NAME = 'files'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'name' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function savePendingFiles(files: File[]): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  store.clear()
  for (const file of files) {
    store.put({ name: file.name, blob: file, size: file.size, type: file.type, lastModified: file.lastModified })
  }
  db.close()
}

export async function loadPendingFiles(): Promise<File[]> {
  const db = await openDB()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => {
      const files = (req.result || []).map(
        (r: { name: string; blob: Blob; type: string; lastModified: number }) =>
          new File([r.blob], r.name, { type: r.type, lastModified: r.lastModified })
      )
      db.close()
      resolve(files)
    }
    req.onerror = () => { db.close(); resolve([]) }
  })
}

export async function clearPendingFiles(): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).clear()
  db.close()
}
