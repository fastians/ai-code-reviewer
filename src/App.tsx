import { useState, useMemo, useEffect, useRef } from "react";
import { Copy, X, Bug, Zap, Shield, Sparkles, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";

type SectionType = "all" | "bugs" | "performance" | "security" | "best-practices";

interface Section {
  type: SectionType;
  title: string;
  content: string;
  icon: React.ReactNode;
  count: number;
}

const REQUEST_TIMEOUT = 60000; // 60 seconds

function App() {
  const [code, setCode] = useState("");
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<SectionType>("all");
  const [copySuccess, setCopySuccess] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Parse review into sections
  const sections = useMemo(() => {
    if (!review || typeof review !== 'string') return [];

    const sectionMap: Record<string, SectionType> = {
      bugs: "bugs",
      performance: "performance",
      security: "security",
      "best practices": "best-practices",
    };

    const parsed: Section[] = [];
    
    try {
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
        if (typeof line !== 'string') continue;
        
        // Check for section headers (#### Section Name)
        const sectionMatch = line.match(/^####\s+(.+)$/i);
        
        if (sectionMatch) {
          // Save previous section
          if (currentSection && currentContent.length > 0) {
            const content = currentContent.join("\n").trim();
            if (content) {
              const count = (content.match(/^\d+\./gm) || []).length;
              parsed.push({
                type: currentSection,
                title: Object.keys(sectionMap).find(k => sectionMap[k] === currentSection) || "",
                content,
                icon: getIcon(currentSection),
                count,
              });
            }
          }

          // Start new section
          const sectionName = sectionMatch[1].toLowerCase().trim();
          currentSection = sectionMap[sectionName] || null;
          currentContent = [];
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      // Save last section
      if (currentSection && currentContent.length > 0) {
        const content = currentContent.join("\n").trim();
        if (content) {
          const count = (content.match(/^\d+\./gm) || []).length;
          parsed.push({
            type: currentSection,
            title: Object.keys(sectionMap).find(k => sectionMap[k] === currentSection) || "",
            content,
            icon: getIcon(currentSection),
            count,
          });
        }
      }
    } catch (parseError) {
      // If parsing fails, return empty array (fallback to showing full review)
      console.error("Error parsing sections:", parseError);
      return [];
    }

    return parsed;
  }, [review]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleReview = async () => {
    // Validation
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Please enter some code to review.");
      return;
    }

    if (trimmedCode.length > 10000) {
      setError("Code is too long. Maximum 10,000 characters allowed.");
      return;
    }

    // Check online status
    if (!isOnline) {
      setError("You are offline. Please check your internet connection.");
      return;
    }

    // Cancel previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError("");
    setReview("");
    setActiveSection("all");

    try {
      const apiUrl = "/api/review";
      
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout. Please try again.")), REQUEST_TIMEOUT);
      });

      // Race between fetch and timeout
      const response = await Promise.race([
        fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code: trimmedCode }),
          signal: abortController.signal,
        }),
        timeoutPromise,
      ]) as Response;

      // Check if request was aborted
      if (abortController.signal.aborted) {
        return;
      }

      // Parse response - try JSON first, fallback to text
      let data: { review?: string; error?: string; message?: string; resetTime?: string };
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      // Read response text once
      const responseText = await response.text();
      
      // Debug logging (remove in production if needed)
      if (!response.ok || !isJson || !responseText) {
        console.error('API Response Error:', {
          status: response.status,
          statusText: response.statusText,
          contentType,
          isJson,
          responseText: responseText.substring(0, 200), // First 200 chars
        });
      }
      
      if (!isJson) {
        // Non-JSON response - likely an error
        throw new Error(responseText || `Server error (${response.status})`);
      }

      if (!responseText) {
        throw new Error("Empty response from server");
      }

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        // JSON parsing failed
        console.error('JSON Parse Error:', parseError, 'Response:', responseText.substring(0, 200));
        throw new Error(responseText || "Invalid response format from server.");
      }

      // Check response status after parsing
      if (!response.ok) {
        if (response.status === 429) {
          const resetTime = data?.resetTime 
            ? new Date(data.resetTime).toLocaleTimeString()
            : 'later';
          throw new Error(`Rate limit exceeded. Please try again after ${resetTime}.`);
        }
        if (response.status === 400) {
          throw new Error(data?.error || data?.message || "Invalid request. Please check your code.");
        }
        if (response.status >= 500) {
          throw new Error(data?.error || data?.message || "Server error. Please try again later.");
        }
        throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
      }

      // Validate review exists
      if (!data || !data.review || typeof data.review !== 'string') {
        throw new Error("Invalid response: Review content is missing.");
      }

      if (data.review.trim().length === 0) {
        throw new Error("Received empty review. Please try again.");
      }

      setReview(data.review);
    } catch (err: unknown) {
      // Don't set error if request was aborted
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      let errorMessage = "Failed to review code";
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }

      // Network error detection
      if (!navigator.onLine) {
        errorMessage = "You are offline. Please check your internet connection.";
      } else if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
        errorMessage = "Network error. Please check your connection and try again.";
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCopyReview = async () => {
    if (!review) return;
    
    try {
      // Check clipboard API availability
      if (!navigator.clipboard) {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = review;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        return;
      }

      await navigator.clipboard.writeText(review);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      setError("Failed to copy to clipboard. Please try selecting and copying manually.");
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    
    try {
      if (!navigator.clipboard) {
        const textArea = document.createElement("textarea");
        textArea.value = code;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        return;
      }

      await navigator.clipboard.writeText(code);
    } catch (err) {
      console.error("Failed to copy:", err);
      setError("Failed to copy to clipboard. Please try selecting and copying manually.");
    }
  };

  const handleClearCode = () => {
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setCode("");
    setReview("");
    setError("");
    setActiveSection("all");
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
              <div className="flex gap-2">
                <button
                  onClick={handleCopyCode}
                  disabled={!code}
                  className={`p-2 rounded transition-colors ${
                    code 
                      ? "hover:bg-slate-700 cursor-pointer opacity-100" 
                      : "opacity-0 cursor-default pointer-events-none"
                  }`}
                  title="Copy code"
                >
                  <Copy className="w-5 h-5" />
                </button>
                <button
                  onClick={handleClearCode}
                  disabled={!code}
                  className={`p-2 rounded transition-colors ${
                    code 
                      ? "hover:bg-slate-700 cursor-pointer opacity-100" 
                      : "opacity-0 cursor-default pointer-events-none"
                  }`}
                  title="Clear code"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste your code here..."
              maxLength={10000}
              className="w-full h-96 bg-slate-900 rounded p-4 font-mono text-sm border border-slate-600 focus:border-blue-500 focus:outline-none resize-none"
            />
            <div className="mt-2 h-5 text-xs text-slate-400 text-right">
              {code.length > 0 ? (
                <span className={code.length > 9000 ? "text-yellow-400" : code.length === 10000 ? "text-red-400" : ""}>
                  {code.length.toLocaleString()} / 10,000 characters
                </span>
              ) : (
                <span className="opacity-0">0 / 10,000 characters</span>
              )}
            </div>
            <button
              onClick={handleReview}
              disabled={loading || !code.trim() || !isOnline}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2"
              aria-label={loading ? "Reviewing code" : "Review code"}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Reviewing...</span>
                </>
              ) : !isOnline ? (
                "Offline - Check Connection"
              ) : (
                "Review Code"
              )}
            </button>
          </div>

          {/* Output */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">AI Review</h2>
              <div className="flex justify-end">
                <button
                  onClick={handleCopyReview}
                  disabled={!review}
                  className={`p-2 rounded transition-colors relative ${
                    review 
                      ? "hover:bg-slate-700 cursor-pointer opacity-100" 
                      : "opacity-0 cursor-default pointer-events-none"
                  }`}
                  title={copySuccess ? "Copied!" : "Copy review to clipboard"}
                  aria-label="Copy review to clipboard"
                >
                  {copySuccess ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Section Filter Buttons */}
            {sections.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveSection("all")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                    activeSection === "all"
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  All ({sections.reduce((sum, s) => sum + s.count, 0)})
                </button>
                {sections.map((section) => (
                  <button
                    key={section.type}
                    onClick={() => setActiveSection(section.type)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                      activeSection === section.type
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                    }`}
                  >
                    {section.icon}
                    <span className="capitalize">{section.title}</span>
                    {section.count > 0 && (
                      <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${
                        activeSection === section.type
                          ? "bg-blue-700"
                          : "bg-slate-800"
                      }`}>
                        {section.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="h-96 overflow-y-auto bg-slate-900 rounded p-4 border border-slate-600">
              {!isOnline && (
                <div className="text-yellow-400 p-4 bg-yellow-950 rounded border border-yellow-800 flex items-start gap-3 mb-3">
                  <span className="text-xl">📡</span>
                  <div className="flex-1">
                    <p className="font-semibold mb-1">Offline</p>
                    <p className="text-sm">You are currently offline. Please check your internet connection.</p>
                  </div>
                </div>
              )}
              {error && (
                <div className="text-red-400 p-4 bg-red-950 rounded border border-red-800 flex items-start gap-3 mb-3">
                  <span className="text-xl">⚠️</span>
                  <div className="flex-1">
                    <p className="font-semibold mb-1">Error</p>
                    <p className="text-sm">{error}</p>
                  </div>
                  <button
                    onClick={() => setError("")}
                    className="text-red-400 hover:text-red-300 transition-colors"
                    aria-label="Dismiss error"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {loading && (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                  <p className="text-slate-400 text-sm">Analyzing your code...</p>
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
                <div className="text-slate-500 text-center h-full flex flex-col items-center justify-center">
                  <div className="text-4xl mb-4">💡</div>
                  <p className="text-sm font-medium mb-1">Ready to review your code?</p>
                  <p className="text-xs">Paste your code and click "Review Code"</p>
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
