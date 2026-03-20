import { parse } from "@babel/parser";
import * as recast from "recast";
import log from "electron-log";

// @babel/traverse needs special handling in CommonJS/Electron environment
// eslint-disable-next-line @typescript-eslint/no-var-requires
const traverse = require("@babel/traverse").default || require("@babel/traverse");

const logger = log.scope("visual_editing_utils");

// Log the location of the loaded babel parser to help diagnose path resolution issues
try {
  const parserPath = require.resolve("@babel/parser");
  logger.info(`@babel/parser loaded from: ${parserPath}`);
} catch (e) {
  logger.warn("Could not resolve @babel/parser path");
}

interface ContentChange {
  classes: string[];
  prefixes: string[];
  textContent?: string;
}

interface ComponentAnalysis {
  isDynamic: boolean;
  hasStaticText: boolean;
  elementType: "text" | "container" | "image" | "button" | "unknown";
  iconName?: string;
  iconLine?: number;
  textContent?: string;
}

/**
 * Pure function that transforms JSX/TSX content by applying style and text changes
 * @param content - The source code content to transform
 * @param changes - Map of line numbers to their changes
 * @returns The transformed source code
 */
export function transformContent(
  content: string,
  changes: Map<number, ContentChange>,
): string {
  try {
    // Parse with babel for compatibility with JSX/TypeScript
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    // Track which lines have been processed to avoid modifying nested elements
    const processedLines = new Set<number>();

    traverse(ast, {
      JSXElement(path) {
        const line = path.node.openingElement.loc?.start.line;

        // Only process if we have changes for this line and haven't processed it yet
        if (line && changes.has(line) && !processedLines.has(line)) {
          processedLines.add(line);
          const change = changes.get(line)!;

          // Check if this element has any nested JSX elements as direct children
          const hasNestedJSX = path.node.children.some(
            (child: any) => child.type === "JSXElement",
          );

          // Update className if there are style changes
          if (change.classes.length > 0) {
            const attributes = path.node.openingElement.attributes;
            let classNameAttr = attributes.find(
              (attr: any) =>
                attr.type === "JSXAttribute" && attr.name.name === "className",
            ) as any;

            if (classNameAttr) {
              // Get existing classes
              let existingClasses: string[] = [];
              if (
                classNameAttr.value &&
                classNameAttr.value.type === "StringLiteral"
              ) {
                existingClasses = classNameAttr.value.value
                  .split(/\s+/)
                  .filter(Boolean);
              }

              // Filter out classes with matching prefixes
              const shouldRemoveClass = (cls: string, prefixes: string[]) => {
                return prefixes.some((prefix) => {
                  // Handle font-weight vs font-family distinction
                  if (prefix === "font-weight-") {
                    const match = cls.match(/^font-\[(\d+)\]$/);
                    return match !== null;
                  } else if (prefix === "font-family-") {
                    const match = cls.match(/^font-\[([^\]]+)\]$/);
                    if (match) {
                      return !/^\d+$/.test(match[1]);
                    }
                    return false;
                  } else if (prefix === "text-size-") {
                    const sizeMatch = cls.match(
                      /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/,
                    );
                    if (sizeMatch) return true;
                    if (cls.match(/^text-\[[\d.]+[a-z]+\]$/)) return true;
                    return false;
                  } else if (prefix === "text-align-") {
                    return ["text-left", "text-center", "text-right", "text-justify"].includes(cls);
                  } else if (prefix === "display-") {
                    return ["flex", "grid", "block", "inline-flex", "inline", "hidden"].includes(cls);
                  } else if (prefix === "flex-direction-") {
                    return cls.startsWith("flex-row") || cls.startsWith("flex-col");
                  } else if (prefix === "my-" || prefix === "py-") {
                    const type = prefix[0];
                    return (
                      cls.startsWith(`${type}t-`) ||
                      cls.startsWith(`${type}b-`) ||
                      cls.startsWith(`${type}y-`) ||
                      cls.match(new RegExp(`^${type}-\\[`))
                    );
                  } else if (prefix === "mx-" || prefix === "px-") {
                    const type = prefix[0];
                    return (
                      cls.startsWith(`${type}l-`) ||
                      cls.startsWith(`${type}r-`) ||
                      cls.startsWith(`${type}x-`) ||
                      cls.match(new RegExp(`^${type}-\\[`))
                    );
                  } else {
                    return cls.startsWith(prefix);
                  }
                });
              };

              let filteredClasses = existingClasses.filter(
                (cls) => !shouldRemoveClass(cls, change.prefixes),
              );

              const addedClasses: string[] = [];

              ["m", "p"].forEach((type) => {
                const hasDirectionalX = change.prefixes.some(
                  (p: string) => p === `${type}x-`,
                );
                const hasDirectionalY = change.prefixes.some(
                  (p: string) => p === `${type}y-`,
                );

                if (!hasDirectionalX && !hasDirectionalY) {
                  return;
                }

                const allSidesClass = existingClasses.find((cls) =>
                  cls.match(new RegExp(`^${type}-\\[([^\\]]+)\\]$`)),
                );

                if (allSidesClass) {
                  filteredClasses = filteredClasses.filter(
                    (cls) => cls !== allSidesClass,
                  );

                  const valueMatch = allSidesClass.match(/\[([^\]]+)\]/);
                  if (valueMatch) {
                    const omnidirectionalValue = valueMatch[1];

                    if (hasDirectionalX && !hasDirectionalY) {
                      addedClasses.push(`${type}y-[${omnidirectionalValue}]`);
                    } else if (hasDirectionalY && !hasDirectionalX) {
                      addedClasses.push(`${type}x-[${omnidirectionalValue}]`);
                    }
                  }
                }
              });

              const updatedClasses = [
                ...filteredClasses,
                ...addedClasses,
                ...change.classes,
              ].join(" ");

              classNameAttr.value = {
                type: "StringLiteral",
                value: updatedClasses,
              };
            } else {
              attributes.push({
                type: "JSXAttribute",
                name: { type: "JSXIdentifier", name: "className" },
                value: {
                  type: "StringLiteral",
                  value: change.classes.join(" "),
                },
              });
            }
          }

          // Determine if text content should be modified
          const shouldModifyText =
            "textContent" in change &&
            change.textContent !== undefined;

          if (shouldModifyText) {
            if (!hasNestedJSX) {
              // Simple case: only text children, replace everything
              path.node.children = [
                {
                  type: "JSXText",
                  value: change.textContent,
                } as any,
              ];
            } else {
              // Mixed content: text + elements (e.g. <button><Heart /> Save</button>)
              // Only replace JSXText nodes, preserve JSXElement children
              let textReplaced = false;
              path.node.children = path.node.children.map((child: any) => {
                if (child.type === "JSXText" && child.value.trim().length > 0) {
                  if (!textReplaced) {
                    textReplaced = true;
                    // Preserve leading/trailing whitespace pattern
                    const leadingSpace = child.value.match(/^\s*/)?.[0] || "";
                    const trailingSpace = child.value.match(/\s*$/)?.[0] || "";
                    return {
                      type: "JSXText",
                      value: `${leadingSpace}${change.textContent}${trailingSpace}`,
                    } as any;
                  }
                  // Remove additional text nodes
                  return { type: "JSXText", value: " " } as any;
                }
                return child;
              });
            }
          }
        }
      },
    });

    const output = recast.print(ast);
    return output.code;
  } catch (error) {
    logger.error("Error in transformContent:", error);
    return content;
  }
}

/**
 * Analyzes a JSX/TSX component at a specific line to determine:
 * - Whether it has dynamic styling (className/style with expressions)
 * - Whether it contains static text content
 * - What type of element it is (text, container, image, button)
 */
export function analyzeComponent(
  content: string,
  line: number,
): ComponentAnalysis {
  try {
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    const lucideImports = new Map<string, string>(); // localName -> originalName
    let foundElement: any = null;

    traverse(ast, {
      ImportDeclaration(path: any) {
        if (path.node.source.value === "lucide-react") {
          path.node.specifiers.forEach((specifier: any) => {
            if (specifier.type === "ImportSpecifier") {
              const importedName = specifier.imported.name;
              const localName = specifier.local.name;
              lucideImports.set(localName, importedName);
            }
          });
        }
      },
      JSXElement(path: any) {
        if (
          path.node.openingElement.loc &&
          path.node.openingElement.loc.start.line === line
        ) {
          foundElement = path.node;
        }
      },
    });

    if (!foundElement) {
      return { isDynamic: false, hasStaticText: false, elementType: "unknown" };
    }

    let dynamic = false;
    let staticText = false;
    let elementType: ComponentAnalysis["elementType"] = "unknown";

    // Determine tag name for element type detection
    const openingElement = foundElement.openingElement;
    let tagName = "";
    if (openingElement.name?.type === "JSXIdentifier") {
      tagName = openingElement.name.name;
    } else if (openingElement.name?.type === "JSXMemberExpression") {
      tagName = (openingElement.name.property?.name || "") as string;
    }
    const tagNameLower = tagName.toLowerCase();

    // Check if it's a Lucide icon
    if (lucideImports.has(tagName)) {
      const iconName = lucideImports.get(tagName)!;
      return { isDynamic: false, hasStaticText: false, elementType: "image", iconName };
    }

    // Collect attribute info for element type detection
    let hasOnClick = false;
    let hasSrc = false;
    let hasHref = false;

    // Check attributes for dynamic styling and element type hints
    if (openingElement.attributes) {
      openingElement.attributes.forEach((attr: any) => {
        if (attr.type === "JSXAttribute" && attr.name && attr.name.name) {
          const attrName = attr.name.name;
          if (attrName === "style" || attrName === "className") {
            if (attr.value && attr.value.type === "JSXExpressionContainer") {
              const expr = attr.value.expression;
              if (
                expr.type === "ConditionalExpression" ||
                expr.type === "LogicalExpression" ||
                expr.type === "TemplateLiteral"
              ) {
                dynamic = true;
              }
              if (
                expr.type === "Identifier" ||
                expr.type === "MemberExpression"
              ) {
                dynamic = true;
              }
              if (expr.type === "CallExpression") {
                dynamic = true;
              }
              if (expr.type === "ObjectExpression") {
                dynamic = true;
              }
            }
          }
          // Element type detection attributes
          if (attrName === "onClick" || attrName === "onPress") {
            hasOnClick = true;
          }
          if (attrName === "src" || attrName === "srcSet") {
            hasSrc = true;
          }
          if (attrName === "href") {
            hasHref = true;
          }
        }
      });
    }

    // Check children for static text AND for child Lucide icons
    let hasText = false;
    let childIconName: string | undefined;
    let childIconLine: number | undefined;
    const textParts: string[] = [];

    if (foundElement.children && foundElement.children.length > 0) {
      foundElement.children.forEach((child: any) => {
        if (child.type === "JSXText") {
          const trimmed = child.value.trim();
          if (trimmed.length > 0) {
            hasText = true;
            textParts.push(trimmed);
          }
        } else if (
          child.type === "JSXExpressionContainer" &&
          child.expression.type === "StringLiteral"
        ) {
          hasText = true;
          textParts.push(child.expression.value);
        } else if (child.type === "JSXElement") {
          // Check if child is a Lucide icon
          const childTag = child.openingElement?.name?.name;
          if (childTag && lucideImports.has(childTag)) {
            childIconName = lucideImports.get(childTag);
            childIconLine = child.openingElement?.loc?.start?.line;
          }
        }
      });
    }

    // Text is considered static if there's any text content
    if (hasText) {
      staticText = true;
    }

    // Determine element type based on tag name, attributes, and children
    const imageTags = ["img", "image", "avatar", "picture", "svg"];
    const buttonTags = ["button", "iconbutton"];
    const textTags = [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "span", "label", "strong", "em", "b", "i",
      "small", "code", "pre", "blockquote",
    ];
    const linkTags = ["a", "link", "navlink"];

    if (imageTags.includes(tagNameLower) || hasSrc) {
      elementType = "image";
    } else if (
      buttonTags.includes(tagNameLower) ||
      (hasOnClick && !tagNameLower.includes("div") && !tagNameLower.includes("section"))
    ) {
      elementType = "button";
    } else if (linkTags.includes(tagNameLower) || hasHref) {
      elementType = "button";
    } else if (textTags.includes(tagNameLower) || staticText) {
      elementType = "text";
    } else {
      elementType = "container";
    }

    return {
      isDynamic: dynamic,
      hasStaticText: staticText,
      elementType,
      iconName: childIconName,
      iconLine: childIconLine,
      textContent: staticText ? textParts.join(" ") : undefined,
    };
  } catch (error) {
    logger.error(`Error analyzing component at line ${line}:`, error);
    return { isDynamic: false, hasStaticText: false, elementType: "unknown" };
  }
}

/**
 * Replaces a Lucide icon component with another one, updating imports and JSX usage.
 */
export function replaceIconComponent(
  content: string,
  line: number,
  newIconName: string,
): string {
  try {
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });

    let oldIconName: string | null = null;
    let iconJSXElement: any = null;

    // First pass: find the element and old icon name
    traverse(ast, {
      JSXElement(path: any) {
        if (
          path.node.openingElement.loc &&
          path.node.openingElement.loc.start.line === line
        ) {
          iconJSXElement = path.node;
          if (path.node.openingElement.name.type === "JSXIdentifier") {
            oldIconName = path.node.openingElement.name.name;
          }
        }
      },
    });

    if (!iconJSXElement || !oldIconName) {
      logger.warn(`Could not find icon element at line ${line}`);
      return content;
    }

    if (oldIconName === newIconName) {
      return content;
    }

    // Second pass: update JSX and imports
    traverse(ast, {
      JSXElement(path: any) {
        if (path.node === iconJSXElement) {
          // Update JSX tag name
          if (path.node.openingElement.name.type === "JSXIdentifier") {
            path.node.openingElement.name.name = newIconName;
          }
          if (
            path.node.closingElement &&
            path.node.closingElement.name.type === "JSXIdentifier"
          ) {
            path.node.closingElement.name.name = newIconName;
          }
        }
      },
      ImportDeclaration(path: any) {
        if (path.node.source.value === "lucide-react") {
          // Check if new icon is already imported
          const existingSpecifier = path.node.specifiers.find((spec: any) =>
            spec.imported.name === newIconName
          );

          if (!existingSpecifier) {
            // Add new import specifier
            // Create specifier manually as object to avoid babel types dependency if not available
            const newSpecifier = {
              type: "ImportSpecifier",
              imported: { type: "Identifier", name: newIconName },
              local: { type: "Identifier", name: newIconName },
            };
            path.node.specifiers.push(newSpecifier);
            // Sort specifiers for niceness (optional)
            path.node.specifiers.sort((a: any, b: any) =>
              a.imported.name.localeCompare(b.imported.name)
            );
          }
        }
      },
    });

    const output = recast.print(ast);
    return output.code;
  } catch (error) {
    logger.error("Error in replaceIconComponent:", error);
    return content;
  }
}
