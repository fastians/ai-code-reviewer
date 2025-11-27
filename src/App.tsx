import { useState, useMemo } from "react";
import { Copy, X, Bug, Zap, Shield, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

type SectionType = "all" | "bugs" | "performance" | "security" | "best-practices";

interface Section {
  type: SectionType;
  title: string;
  content: string;
  icon: React.ReactNode;
  count: number;
}

function App() {
  const [code, setCode] = useState("");
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<SectionType>("all");

  // Parse review into sections
  const sections = useMemo(() => {
    if (!review) return [];

    const sectionMap: Record<string, SectionType> = {
      bugs: "bugs",
      performance: "performance",
      security: "security",
      "best practices": "best-practices",
    };

    const parsed: Section[] = [];
    const lines = review.split("\n");
    let currentSection: SectionType | null = null;
    let currentContent: string[] = [];

    const getIcon = (type: SectionType) => {
      switch (type) {
        case "bugs":
          return <Bug className="w-4 h-4" />;
        case "performance":
          return <Zap className="w-4 h-4" />;
        case "security":
          return <Shield className="w-4 h-4" />;
        case "best-practices":
          return <Sparkles className="w-4 h-4" />;
        default:
          return null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check for section headers (#### Section Name)
      const sectionMatch = line.match(/^####\s+(.+)$/i);
      
      if (sectionMatch) {
        // Save previous section
        if (currentSection && currentContent.length > 0) {
          const content = currentContent.join("\n").trim();
          const count = (content.match(/^\d+\./gm) || []).length;
          parsed.push({
            type: currentSection,
            title: Object.keys(sectionMap).find(k => sectionMap[k] === currentSection) || "",
            content,
            icon: getIcon(currentSection),
            count,
          });
        }

        // Start new section
        const sectionName = sectionMatch[1].toLowerCase();
        currentSection = sectionMap[sectionName] || null;
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentSection && currentContent.length > 0) {
      const content = currentContent.join("\n").trim();
      const count = (content.match(/^\d+\./gm) || []).length;
      parsed.push({
        type: currentSection,
        title: Object.keys(sectionMap).find(k => sectionMap[k] === currentSection) || "",
        content,
        icon: getIcon(currentSection),
        count,
      });
    }

    return parsed;
  }, [review]);

  const handleReview = async () => {
    if (!code.trim()) return;

    if (code.length > 10000) {
      setError("Code is too long. Maximum 10,000 characters allowed.");
      return;
    }

    setLoading(true);
    setError("");
    setReview("");
    setActiveSection("all");

    try {
      const apiUrl = "/api/review";
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          const resetTime = data.resetTime 
            ? new Date(data.resetTime).toLocaleTimeString()
            : 'later';
          throw new Error(`Rate limit exceeded. Please try again after ${resetTime}.`);
        }
        throw new Error(data.error || data.message || "Failed to review code");
      }

      setReview(data.review);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to review code";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyReview = async () => {
    if (!review) return;
    try {
      await navigator.clipboard.writeText(review);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleClearCode = () => {
    setCode("");
  };

  const filteredContent = useMemo(() => {
    if (activeSection === "all") return review;
    
    const section = sections.find(s => s.type === activeSection);
    if (!section) return review;
    
    return `#### ${section.title}\n\n${section.content}`;
  }, [review, sections, activeSection]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">AI Code Reviewer</h1>
          <p className="text-slate-400">
            Instant code analysis powered by GPT-4
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Input */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">Your Code</h2>
              <div className="flex gap-2 min-w-[88px] justify-end">
                {code && (
                  <>
                    <button
                      onClick={handleCopyCode}
                      className="p-2 hover:bg-slate-700 rounded transition-colors"
                      title="Copy code"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleClearCode}
                      className="p-2 hover:bg-slate-700 rounded transition-colors"
                      title="Clear code"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste your code here..."
              maxLength={10000}
              className="w-full h-96 bg-slate-900 rounded p-4 font-mono text-sm border border-slate-600 focus:border-blue-500 focus:outline-none resize-none"
            />
            {code.length > 0 && (
              <div className="mt-2 text-xs text-slate-400 text-right">
                {code.length.toLocaleString()} / 10,000 characters
              </div>
            )}
            <button
              onClick={handleReview}
              disabled={loading || !code.trim()}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition"
            >
              {loading ? "Reviewing..." : "Review Code"}
            </button>
          </div>

          {/* Output */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">AI Review</h2>
              <div className="min-w-[40px] flex justify-end">
                {review && (
                  <button
                    onClick={handleCopyReview}
                    className="p-2 hover:bg-slate-700 rounded transition-colors"
                    title="Copy review to clipboard"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Section Filter Buttons */}
            {sections.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveSection("all")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeSection === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  All ({sections.reduce((sum, s) => sum + s.count, 0)})
                </button>
                {sections.map((section) => (
                  <button
                    key={section.type}
                    onClick={() => setActiveSection(section.type)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      activeSection === section.type
                        ? "bg-blue-600 text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    {section.icon}
                    {section.title}
                    {section.count > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-slate-800 rounded text-xs">
                        {section.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="h-96 overflow-y-auto bg-slate-900 rounded p-4 border border-slate-600">
              {error && (
                <div className="text-red-400 p-4 bg-red-950 rounded">
                  {error}
                </div>
              )}
              {loading && (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              )}
              {review && (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      code: ({ className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match;
                        return !isInline ? (
                          <pre className="bg-slate-800 rounded p-3 overflow-x-auto my-2">
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                        ) : (
                          <code className="bg-slate-800 px-1.5 py-0.5 rounded text-sm" {...props}>
                            {children}
                          </code>
                        );
                      },
                      h3: ({ children }) => (
                        <h3 className="text-xl font-semibold mt-4 mb-2 text-blue-400">{children}</h3>
                      ),
                      h4: ({ children }) => (
                        <h4 className="text-lg font-semibold mt-3 mb-2 text-blue-300">{children}</h4>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
                      ),
                      li: ({ children }) => (
                        <li className="ml-4">{children}</li>
                      ),
                      p: ({ children }) => (
                        <p className="my-2 text-slate-300">{children}</p>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-white">{children}</strong>
                      ),
                    }}
                  >
                    {filteredContent}
                  </ReactMarkdown>
                </div>
              )}
              {!review && !loading && !error && (
                <div className="text-slate-500 text-center h-full flex items-center justify-center">
                  Paste code and click "Review Code" to get AI feedback
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-8 grid md:grid-cols-4 gap-4 text-sm">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div className="text-2xl mb-2">🐛</div>
            <div className="font-semibold">Bug Detection</div>
            <div className="text-slate-400 text-xs">
              Identifies logic errors
            </div>
          </div>
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div className="text-2xl mb-2">⚡</div>
            <div className="font-semibold">Performance</div>
            <div className="text-slate-400 text-xs">
              Optimization suggestions
            </div>
          </div>
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div className="text-2xl mb-2">🔒</div>
            <div className="font-semibold">Security</div>
            <div className="text-slate-400 text-xs">Vulnerability scanning</div>
          </div>
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div className="text-2xl mb-2">✨</div>
            <div className="font-semibold">Best Practices</div>
            <div className="text-slate-400 text-xs">Code quality tips</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
