-- Phase 8 · 024_performance_indexes — indexes for foreign keys used in filters, triggers and usage checks.

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "examinations_grading_scale_id_idx" ON "examinations"("grading_scale_id");

-- CreateIndex
CREATE INDEX "payroll_items_salary_component_id_idx" ON "payroll_items"("salary_component_id");

-- CreateIndex
CREATE INDEX "sections_class_teacher_id_idx" ON "sections"("class_teacher_id");

-- CreateIndex
CREATE INDEX "student_fee_dues_fee_head_id_idx" ON "student_fee_dues"("fee_head_id");

-- CreateIndex
CREATE INDEX "student_transport_route_stop_id_idx" ON "student_transport"("route_stop_id");

-- CreateIndex
CREATE INDEX "teacher_assignments_class_subject_id_idx" ON "teacher_assignments"("class_subject_id");

-- CreateIndex
CREATE INDEX "timetable_entries_class_subject_id_idx" ON "timetable_entries"("class_subject_id");

