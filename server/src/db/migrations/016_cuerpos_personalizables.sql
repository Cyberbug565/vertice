UPDATE characters
SET appearance = appearance - 'model'
WHERE appearance ? 'model';
