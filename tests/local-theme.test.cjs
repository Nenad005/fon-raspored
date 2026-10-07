const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Module } = require("node:module");
const ts = require("typescript");
const React = require("react");

function load(file, mocks) {
  const filename = resolve(file);
  const mod = new Module(filename);
  mod.require = (id) => {
    if (id === "react/jsx-runtime") return require(id);
    assert.ok(id in mocks, `Unexpected dependency: ${id}`);
    return mocks[id];
  };
  mod._compile(
    ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}

test("theme provider delegates browser persistence without an account sync child", () => {
  const { ThemeProvider } = load("src/components/theme-provider.tsx", {
    "next-themes": { ThemeProvider: "NextThemesProvider" },
  });
  const tree = ThemeProvider({
    children: "content",
    attribute: "class",
    defaultTheme: "system",
    enableSystem: true,
  });
  assert.equal(tree.type, "NextThemesProvider");
  assert.equal(tree.props.storageKey, "theme");
  assert.equal(tree.props.defaultTheme, "system");
  assert.equal(tree.props.enableSystem, true);
  assert.equal(tree.props.children, "content");
});

test("all theme choices update immediately through next-themes without auth or API dependencies", () => {
  const choices = [];
  const { ModeToggle } = load("src/components/ui/mode-toggle.tsx", {
    "next-themes": {
      useTheme: () => ({ setTheme: (theme) => choices.push(theme) }),
    },
    "lucide-react": { Moon: "Moon", Sun: "Sun" },
    "~/components/ui/button": { Button: "Button" },
    "~/components/ui/dropdown-menu": Object.fromEntries(
      [
        "DropdownMenu",
        "DropdownMenuContent",
        "DropdownMenuItem",
        "DropdownMenuTrigger",
      ].map((name) => [name, name]),
    ),
  });
  function nodes(node) {
    if (!React.isValidElement(node)) return [];
    return [
      node,
      ...React.Children.toArray(node.props.children).flatMap(nodes),
    ];
  }
  const tree = nodes(ModeToggle());
  assert.ok(!tree.find((node) => node.type === "Button").props.disabled);
  for (const item of tree.filter((node) => node.type === "DropdownMenuItem")) {
    assert.ok(!item.props.disabled);
    item.props.onClick();
  }
  assert.deepEqual(choices, ["light", "dark", "system"]);
});
