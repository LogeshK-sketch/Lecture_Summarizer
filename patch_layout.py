import re

with open('frontend/css/style.css', 'r') as f:
    css = f.read()

# Fix app-layout
app_layout_css = """
.app-layout {
  display: flex;
  min-height: 100vh;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
}
"""
css = re.sub(r'\.app-layout\s*\{[^}]+\}', app_layout_css, css)

# Fix main-content width
main_content_css = """
.main-content {
  margin-left: var(--sidebar-width);
  width: calc(100% - var(--sidebar-width));
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg-base);
}
"""
css = re.sub(r'\.main-content\s*\{[^}]+\}', main_content_css, css)

with open('frontend/css/style.css', 'w') as f:
    f.write(css)

