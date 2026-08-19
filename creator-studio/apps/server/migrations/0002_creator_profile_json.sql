-- Issue #1: creator_profiles 新增 profile_json / injection_json / revision 列
-- 向后兼容：既有行默认 '{}'（空画像/全开）与 revision 1。

ALTER TABLE creator_profiles ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE creator_profiles ADD COLUMN injection_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE creator_profiles ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);