-- PromptType table
CREATE TABLE PromptType (
    type TEXT PRIMARY KEY,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
);

-- Prompt table
CREATE TABLE Prompt (
    id TEXT PRIMARY KEY,
    type TEXT,
    prompts TEXT,  -- Store as JSON array
    metadata TEXT, -- Store as JSON array
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (type) REFERENCES PromptType(type)
);

-- Index for faster lookups
CREATE INDEX idx_prompt_type ON Prompt(type);
