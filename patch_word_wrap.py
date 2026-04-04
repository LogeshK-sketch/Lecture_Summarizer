import re

with open('frontend/css/style.css', 'r') as f:
    css = f.read()

# Fix records-grid
grid_css = """
.records-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 18px;
  width: 100%;
}
"""
css = re.sub(r'\.records-grid\s*\{[^}]+\}', grid_css, css)

# Fix record-card
card_css = """
.record-card {
  background: var(--bg-card);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
  transition: var(--transition);
  cursor: pointer;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}
"""
css = re.sub(r'\.record-card\s*\{[^}]+\}', card_css, css)

# Fix record-summary
summary_css = """
.record-summary {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 14px;
  word-break: break-word;
  white-space: pre-wrap;
}
"""
css = re.sub(r'\.record-summary\s*\{[^}]+\}', summary_css, css)

with open('frontend/css/style.css', 'w') as f:
    f.write(css)

