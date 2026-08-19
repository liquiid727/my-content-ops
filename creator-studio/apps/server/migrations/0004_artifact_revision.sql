-- Issue #2: artifacts 表增加 revision 乐观并发列（手动编辑 PATCH 使用）。
ALTER TABLE artifacts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
