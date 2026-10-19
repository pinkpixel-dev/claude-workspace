// A two-cell glyph per file kind, plain Unicode so it draws without a patched font.
const KINDS: [string, RegExp][] = [
  ['<>', /\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro|html?|xml)$/],
  ['λ ', /\.(rs|go|py|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|lua|zig|sh|bash|zsh|fish)$/],
  ['# ', /\.(css|scss|sass|less)$/],
  ['{}', /\.(json|jsonc|ya?ml|toml|ini|env|lock)$|^\.(env|npmrc|editorconfig|gitignore|gitattributes)/],
  ['¶ ', /\.(md|mdx|txt|rst|adoc)$|^(readme|license|changelog)/i],
  ['▣ ', /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/],
]

export const fileIcon = (name: string) => KINDS.find(([, pattern]) => pattern.test(name.toLowerCase()))?.[0] ?? '· '

export const DIR_ICON = '▸ '
