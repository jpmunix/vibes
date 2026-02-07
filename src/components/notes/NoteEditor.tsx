import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

    // Check if content looks like Markdown (contains markdown syntax)
    const markdownPatterns = [
      /^#{1,6}\s/m, // Headers
      /^\*\*.*\*\*/m, // Bold
      /^\*.*\*/m, // Italic
      /^-\s/m, // Unordered list
      /^\d+\.\s/m, // Ordered list
      /^>\s/m, // Blockquote
    ];

    const looksLikeMarkdown = markdownPatterns.some((pattern) =>
      pattern.test(content),
    );
    const isHTML = /<[^>]+>/.test(content);

    // If it looks like Markdown and is not HTML, convert it
    if (looksLikeMarkdown && !isHTML) {
      try {
        return marked.parse(content) as string;
      } catch (e) {
        console.error("Error parsing markdown:", e);
        return content;
      }
    }

    return content;
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
      }),
      Typography,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: processedContent,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[calc(100vh-250px)] px-4 py-3 bg-background text-foreground prose-headings:font-semibold prose-h1:text-3xl prose-h1:mb-4 prose-h2:text-2xl prose-h2:mb-3 prose-h3:text-xl prose-h3:mb-2 prose-p:mb-3 prose-ul:mb-3 prose-ul:list-disc prose-ul:pl-5 prose-ol:mb-3 prose-ol:list-decimal prose-ol:pl-5 prose-li:mb-1 prose-strong:font-bold prose-em:italic",
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
    <div className="border rounded-lg overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="border-b bg-muted/50 p-2 flex flex-wrap gap-1">
        <Button
          size="sm"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border self-center mx-1" />
        <Button
          size="sm"
          variant={
            editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"
          }
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
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
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={
            editor.isActive("heading", { level: 3 }) ? "secondary" : "ghost"
          }
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          <Heading3 className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border self-center mx-1" />
        <Button
          size="sm"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />
    </div>
  );
}
