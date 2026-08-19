-- 多源生成：runs 表记录画布多选的全部源 artifact（sourceArtifactId 仍为主源，向后兼容单源）。
ALTER TABLE runs ADD COLUMN source_artifact_ids_json TEXT NOT NULL DEFAULT '[]';
