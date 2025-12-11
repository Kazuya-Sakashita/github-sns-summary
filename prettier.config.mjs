// prettier.config.mjs
/** @type {import("prettier").Config} */
const config = {
  semi: false, // セミコロンなし (お好みで true にしてもOK)
  singleQuote: false, // JS/TS はダブルクォート（Next/React系のデフォルト寄せ）
  trailingComma: "all",
  tabWidth: 2,
  printWidth: 100,
  jsxSingleQuote: false,
  bracketSpacing: true,
  plugins: ["prettier-plugin-tailwindcss"],
}

export default config
