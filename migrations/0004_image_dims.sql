-- 圖片寬高:封面優先挑直式圖、橫圖放直框時改成不裁切。舊圖用 /admin/measure 補量。
ALTER TABLE item_images ADD COLUMN width INTEGER;
ALTER TABLE item_images ADD COLUMN height INTEGER;
