import { query } from './db.js';

/**
 * O'qituvchi shu guruhda shu fanni o'qitadimi?
 * Ballar faqat biriktirilgan fan bo'yicha qo'yilishi mumkin.
 */
export async function teacherCanGradeStudentSubject(teacherId, groupId, subjectId) {
  const { rows } = await query(
    `SELECT 1 FROM teaching_assignments
     WHERE teacher_id = $1 AND group_id = $2 AND subject_id = $3`,
    [teacherId, groupId, subjectId]
  );
  return rows.length > 0;
}

/** Ota-ona farzandini tasdiqlangan holda ko'ra oladimi? */
export async function parentCanSeeStudent(parentId, studentId) {
  const { rows } = await query(
    `SELECT 1 FROM parent_student_links
     WHERE parent_id = $1 AND student_id = $2 AND status = 'approved'`,
    [parentId, studentId]
  );
  return rows.length > 0;
}
