/**
 * db.js – Firestore client-side service for LectureMind.
 * Records are stored under: records/{docId}
 * Security rules ensure users can only access their own records.
 */
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const RECORDS_COLLECTION = "records";

/**
 * Save a new lecture summary record for the authenticated user.
 * @returns {string} The new document ID
 */
export async function saveRecord({
  uid,
  email,
  transcript,
  summary,
  keyPoints = [],
  sourceType = "text",
  sourceName = "",
  summaryLength = "medium",
}) {
  const docRef = await addDoc(collection(db, RECORDS_COLLECTION), {
    uid,
    email,
    transcript,
    summary,
    key_points: keyPoints,
    source_type: sourceType,
    source_name: sourceName,
    summary_length: summaryLength,
    created_at: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Fetch all records for the given user, newest first.
 * @returns {Array} List of record objects with 'id' field
 */
export async function getUserRecords(uid) {
  const q = query(
    collection(db, RECORDS_COLLECTION),
    where("uid", "==", uid),
    orderBy("created_at", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    };
  });
}

/**
 * Delete a record by ID.
 * Firestore security rules enforce ownership — only the record owner can delete.
 */
export async function deleteRecord(recordId) {
  await deleteDoc(doc(db, RECORDS_COLLECTION, recordId));
}
