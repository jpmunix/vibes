import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Highlight from "@tiptap/extension-highlight";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useEffect, useMemo } from "react";
import { marked } from "marked";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Underline as UnderlineIcon,
  Strikethrough,
  Baseline,
  Highlighter,
  Palette,
  Code,
  Smile,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const lowlight = createLowlight(common);

// Custom Font Size Extension
const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return {
      types: ["textStyle"],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              element.style.fontSize.replace(/['"]+/g, ""),
            renderHTML: (attributes) => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: any) => {
          return chain().setMark("textStyle", { fontSize }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }: any) => {
          return chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run();
        },
    } as any;
  },
});

const FONT_SIZES = [
  { label: "Pequeño", value: "12px" },
  { label: "Normal", value: "16px" },
  { label: "Grande", value: "20px" },
  { label: "Extra Grande", value: "24px" },
  { label: "Título", value: "32px" },
];

const COLORS = [
  { label: "Default", value: "inherit" },
  { label: "Gris", value: "#6b7280" },
  { label: "Rojo", value: "#ef4444" },
  { label: "Azul", value: "#3b82f6" },
  { label: "Verde", value: "#22c55e" },
  { label: "Amarillo", value: "#eab308" },
  { label: "Violeta", value: "#a855f7" },
];

const HIGHLIGHTS = [
  { label: "Ninguno", value: "transparent" },
  { label: "Amarillo", value: "#fef08a" },
  { label: "Verde", value: "#bbf7d0" },
  { label: "Azul", value: "#bfdbfe" },
  { label: "Rosa", value: "#fbcfe8" },
];

const EMOJIS = ["😀", "🚀", "💡", "✅", "🔥", "✨", "📝", "💻", "❤️", "👍"];

interface NoteEditorProps {
  content: string;
  onUpdate: (content: string) => void;
  placeholder?: string;
}

export function NoteEditor({
  content,
  onUpdate,
  placeholder = "Escribe tu nota aquí...",
}: NoteEditorProps) {
  // Detect if content looks like Markdown and convert to HTML
  const processedContent = useMemo(() => {
    if (!content) return content;

    // Check if content is already HTML
    const isHTML = /<[^>]+>/.test(content);
    if (isHTML) return content;

    // If not HTML, we assume it's Markdown or plain text from a debate summary
    // and convert it. We'll use a slightly broader detection for Markdown
    // or just always parse it if it's not HTML and coming from our specific flow
    try {
      return marked.parse(content) as string;
    } catch (e) {
      console.error("Error parsing markdown:", e);
      return content;
    }
  }, [content]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        hardBreak: {
          keepMarks: false,
        },
        codeBlock: false, // Disable default code block to use lowlight instead
      }),
      Typography,
      Placeholder.configure({
        placeholder,
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
      FontSize,
      CodeBlockLowlight.configure({
        lowlight,
      }),
    ],
    content: processedContent,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-lg dark:prose-invert focus:outline-none min-h-[calc(100vh-12rem)] w-full max-w-none px-12 py-12 bg-background text-foreground shadow-lg border border-border/40 rounded-lg",
      },
    },
  });

  // Update editor content when content prop changes (e.g., when switching notes)
  useEffect(() => {
    if (editor && processedContent !== editor.getHTML()) {
      editor.commands.setContent(processedContent);
    }
  }, [processedContent, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full px-8 flex flex-col items-center">
      {/* Floating Toolbar */}
      <div className="sticky top-6 z-50 mb-8 transition-all duration-200 ease-in-out hover:scale-105">
        <div className="flex items-center gap-1 p-1.5 bg-background/80 backdrop-blur-xl border border-border/50 rounded-full shadow-md overflow-x-auto no-scrollbar max-w-[90vw]">
          <Button
            size="sm"
            variant={editor.isActive("bold") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className="rounded-full h-8 w-8 p-0 shrink-0"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={editor.isActive("italic") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className="rounded-full h-8 w-8 p-0 shrink-0"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={editor.isActive("underline") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className="rounded-full h-8 w-8 p-0 shrink-0"
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={editor.isActive("strike") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className="rounded-full h-8 w-8 p-0 shrink-0"
          >
            <Strikethrough className="h-4 w-4" />
          </Button>

          <div className="w-px h-4 bg-border mx-1 shrink-0" />

          {/* Font Size Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full h-8 px-2 flex gap-1 shrink-0"
              >
                <Type className="h-4 w-4" />
                <span className="text-xs hidden sm:inline">Size</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {FONT_SIZES.map((size) => (
                <DropdownMenuItem
                  key={size.value}
                  onClick={() =>
                    (editor.commands as any).setFontSize(size.value)
                  }
                >
                  <span style={{ fontSize: size.value }}>{size.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Color Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full h-8 w-8 p-0 shrink-0"
              >
                <Palette className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <div className="grid grid-cols-4 gap-1 p-2">
                {COLORS.map((color) => (
                  <Button
                    key={color.value}
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 rounded-full p-0 border border-border/50"
                    style={{
                      backgroundColor:
                        color.value === "inherit" ? "transparent" : color.value,
                    }}
                    onClick={() =>
                      editor.chain().focus().setColor(color.value).run()
                    }
                  />
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Highlight Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full h-8 w-8 p-0 shrink-0"
              >
                <Highlighter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <div className="grid grid-cols-5 gap-1 p-2">
                {HIGHLIGHTS.map((h) => (
                  <Button
                    key={h.value}
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 rounded-sm p-0 border border-border/50"
                    style={{ backgroundColor: h.value }}
                    onClick={() =>
                      editor
                        .chain()
                        .focus()
                        .setHighlight({ color: h.value })
                        .run()
                    }
                  />
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-px h-4 bg-border mx-1 shrink-0" />

          <Button
            size="sm"
            variant={
              editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"
            }
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            className="rounded-full h-8 w-8 p-0 shrink-0"
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={
              editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"
            }
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className="rounded-full h-8 w-8 p-0 shrink-0"
          >
            <Heading2 className="h-4 w-4" />
          </Button>

          <div className="w-px h-4 bg-border mx-1 shrink-0" />

          <Button
            size="sm"
            variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className="rounded-full h-8 w-8 p-0 shrink-0"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className="rounded-full h-8 w-8 p-0 shrink-0"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>

          <div className="w-px h-4 bg-border mx-1 shrink-0" />

          <Button
            size="sm"
            variant={editor.isActive("codeBlock") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className="rounded-full h-8 w-8 p-0 shrink-0"
          >
            <Code className="h-4 w-4" />
          </Button>

          {/* Emoji Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full h-8 w-8 p-0 shrink-0"
              >
                <Smile className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <div className="grid grid-cols-5 gap-1 p-2">
                {EMOJIS.map((emoji) => (
                  <Button
                    key={emoji}
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 text-lg p-0"
                    onClick={() =>
                      editor.chain().focus().insertContent(emoji).run()
                    }
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Editor Sheet */}
      <div className="w-full flex justify-center pb-24">
        <EditorContent editor={editor} className="w-full" />
      </div>
    </div>
  );
}
