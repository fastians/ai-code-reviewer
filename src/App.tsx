import { useState, useMemo, useEffect, useRef } from "react";
import { Copy, X, Bug, Zap, Shield, Sparkles, Check, Clock } from "lucide-react";
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

// Rate limit countdown component
function RateLimitCountdown({ resetTime }: { resetTime: number }) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const diff = resetTime - now;

      if (diff <= 0) {
        setTimeLeft('Limit reset! You can try again now.');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeLeft(`Resets in ${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeLeft(`Resets in ${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`Resets in ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [resetTime]);

  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-orange-300">
      <Clock className="w-3 h-3" />
      <span>{timeLeft}</span>
    </div>
  );
}

function App() {
  const [code, setCode] = useState("");
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rateLimitResetTime, setRateLimitResetTime] = useState<number | null>(null);
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
        
        // Check for section headers (### Section Name or #### Section Name)
        const sectionMatch = line.match(/^#{3,4}\s+(.+)$/i);
        
        if (sectionMatch) {
          // Save previous section
          if (currentSection && currentContent.length > 0) {
            const content = currentContent.join("\n").trim();
            if (content) {
              // Count numbered items: matches lines starting with optional whitespace, then number and period
              // Examples: "1. ", "  2. ", "1. **", etc.
              const numberedItems = content.match(/^\s*\d+\./gm) || [];
              const count = numberedItems.length;
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
          // Count numbered items: matches lines starting with optional whitespace, then number and period
          // Examples: "1. ", "  2. ", "1. **", etc.
          const numberedItems = content.match(/^\s*\d+\./gm) || [];
          const count = numberedItems.length;
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
    setRateLimitResetTime(null);
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
          // Store reset time for countdown display
          if (data?.resetTime) {
            setRateLimitResetTime(new Date(data.resetTime).getTime());
          }
          // Use the message from server if available, otherwise format resetTime
          const errorMessage = data?.message || (data?.resetTime 
            ? `Rate limit exceeded. Please try again after ${new Date(data.resetTime).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })}.`
            : 'Rate limit exceeded. Please try again later.');
          throw new Error(errorMessage);
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
      // Clear rate limit reset time if it's not a rate limit error
      if (!errorMessage.includes('Rate limit') && !errorMessage.includes('rate limit')) {
        setRateLimitResetTime(null);
      }
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
    setRateLimitResetTime(null);
    setActiveSection("all");
  };

  // Section refs for scrolling
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const reviewContainerRef = useRef<HTMLDivElement | null>(null);

  // Scroll to section when activeSection changes
  useEffect(() => {
    if (activeSection !== "all" && sectionRefs.current[activeSection]) {
      sectionRefs.current[activeSection]?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start',
        inline: 'nearest'
      });
    }
  }, [activeSection, review]);

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
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 flex flex-col">
            <div className="flex items-center justify-between mb-3 shrink-0">
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
              className="w-full h-96 bg-slate-900 rounded p-4 font-mono text-sm border border-slate-600 focus:border-blue-500 focus:outline-none resize-none shrink-0"
            />
            <div className="mt-2 h-5 text-xs text-slate-400 text-right shrink-0">
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
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 shrink-0"
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
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 flex flex-col">
            <div className="flex items-center justify-between mb-3 shrink-0">
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

            <div className="flex flex-col" style={{ height: 'calc(24rem + 1.25rem + 3.5rem)' }}>
              <div ref={reviewContainerRef} className="h-96 overflow-y-auto bg-slate-900 rounded p-4 border border-slate-600 mb-4 shrink-0">
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
                <div className={`p-4 rounded border flex items-start gap-3 mb-3 ${
                  error.includes('Rate limit') || error.includes('rate limit')
                    ? 'text-orange-400 bg-orange-950 border-orange-800'
                    : 'text-red-400 bg-red-950 border-red-800'
                }`}>
                  <span className="text-xl">
                    {error.includes('Rate limit') || error.includes('rate limit') ? '⏰' : '⚠️'}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold mb-1">
                      {error.includes('Rate limit') || error.includes('rate limit') ? 'Rate Limit Exceeded' : 'Error'}
                    </p>
                    <p className="text-sm">{error}</p>
                    {rateLimitResetTime && (error.includes('Rate limit') || error.includes('rate limit')) && (
                      <RateLimitCountdown resetTime={rateLimitResetTime} />
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setError("");
                      setRateLimitResetTime(null);
                    }}
                    className={`hover:opacity-70 transition-opacity ${
                      error.includes('Rate limit') || error.includes('rate limit')
                        ? 'text-orange-400 hover:text-orange-300'
                        : 'text-red-400 hover:text-red-300'
                    }`}
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
                 <div ref={reviewContainerRef} className="markdown-content text-slate-300 leading-relaxed pt-2">
                    <ReactMarkdown
                      remarkPlugins={[]}
                      components={{
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      code: ({ className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match;
                        return !isInline ? (
                          <div className="my-2">
                            <pre className="bg-slate-900/80 rounded-md p-4 overflow-x-auto border border-slate-700/50 text-sm leading-relaxed">
                              <code className={`${className} font-mono text-slate-200`} {...props}>
                                {children}
                              </code>
                            </pre>
                          </div>
                        ) : (
                          <code className="bg-slate-800/60 px-1.5 py-0.5 rounded text-sm border border-slate-700/50 text-blue-300 font-mono" {...props}>
                            {children}
                          </code>
                        );
                      },
                      h2: ({ children }) => (
                        <h2 className="text-2xl font-bold mt-6 mb-4 text-white pb-2 border-b border-slate-700/50">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => {
                        const text = typeof children === 'string' ? children : '';
                        const sectionType = sections.find(s => 
                          text.toLowerCase().includes(s.title.toLowerCase())
                        )?.type;
                        const section = sections.find(s => s.type === sectionType);
                        
                        return (
                          <div
                            ref={(el) => {
                              if (sectionType) {
                                sectionRefs.current[sectionType] = el;
                              }
                            }}
                            className="scroll-mt-4"
                          >
                            <h3 className="text-xl font-bold mt-6 mb-4 text-blue-400 flex items-center gap-2 pb-2 border-b border-slate-700/50">
                              {section?.icon}
                              <span>{children}</span>
                              {section && section.count > 0 && (
                                <span className="ml-auto bg-blue-600/20 text-blue-400 text-xs font-semibold px-2 py-1 rounded">
                                  {section.count} {section.count === 1 ? 'issue' : 'issues'}
                                </span>
                              )}
                            </h3>
                          </div>
                        );
                      },
                      h4: ({ children }) => {
                        const text = typeof children === 'string' ? children : '';
                        const sectionType = sections.find(s => 
                          text.toLowerCase().includes(s.title.toLowerCase())
                        )?.type;
                        const section = sections.find(s => s.type === sectionType);
                        
                        return (
                          <div
                            ref={(el) => {
                              if (sectionType) {
                                sectionRefs.current[sectionType] = el;
                              }
                            }}
                            className="scroll-mt-4"
                          >
                            <h4 className="text-lg font-bold mt-6 mb-3 text-blue-400 flex items-center gap-2 pb-2 border-b border-slate-700/50">
                              {section?.icon}
                              <span>{children}</span>
                              {section && section.count > 0 && (
                                <span className="ml-auto bg-blue-600/20 text-blue-400 text-xs font-semibold px-2 py-1 rounded">
                                  {section.count} {section.count === 1 ? 'issue' : 'issues'}
                                </span>
                              )}
                            </h4>
                          </div>
                        );
                      },
                      ul: ({ children }) => (
                        <ul className="list-disc space-y-2 my-4 ml-6 text-slate-300">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal space-y-3 my-4 ml-6 text-slate-300 marker:text-blue-400 marker:font-semibold">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => {
                        // Extract text to check if it contains bold text (issue title)
                        const extractText = (node: React.ReactNode): string => {
                          if (typeof node === 'string') return node;
                          if (typeof node === 'number') return String(node);
                          if (Array.isArray(node)) {
                            return node.map(extractText).join('');
                          }
                          if (node && typeof node === 'object' && 'props' in node) {
                            const props = node.props as { children?: React.ReactNode };
                            return extractText(props.children);
                          }
                          return '';
                        };
                        
                        const text = extractText(children);
                        const hasBoldTitle = text.includes('**') || /^\d+\.\s+\*\*/.test(text);
                        
                        return (
                          <li className={`${hasBoldTitle ? 'mb-3' : 'mb-1'} leading-relaxed`}>
                            <div className="[&>strong]:text-blue-300 [&>strong]:font-semibold [&>code]:bg-slate-800/60 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-sm">
                              {children}
                            </div>
                          </li>
                        );
                      },
                      p: ({ children }) => {
                        // Extract text content from children
                        const extractText = (node: React.ReactNode): string => {
                          if (typeof node === 'string') return node;
                          if (typeof node === 'number') return String(node);
                          if (Array.isArray(node)) {
                            return node.map(extractText).join('');
                          }
                          if (node && typeof node === 'object' && 'props' in node) {
                            const props = node.props as { children?: React.ReactNode };
                            return extractText(props.children);
                          }
                          return '';
                        };
                        
                        const text = extractText(children);
                        const cleanedText = text.replace(/\s+/g, ' ').trim();
                        
                        // Remove empty paragraphs
                        if (!cleanedText || cleanedText === '') {
                          return null;
                        }
                        
                        return (
                          <p className="my-4 leading-relaxed text-slate-300 [&>strong]:text-blue-300 [&>strong]:font-semibold [&>code]:bg-slate-800/60 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-sm">
                            {children}
                          </p>
                        );
                      },
                      strong: ({ children }) => (
                        <strong className="font-semibold text-blue-300">{children}</strong>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-blue-500/50 pl-4 my-4 italic text-slate-400">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {review}
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

              {/* Features Summary - Clickable navigation */}
              {review && sections.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 shrink-0">
                <button
                  onClick={() => setActiveSection("bugs")}
                  disabled={(sections.find(s => s.type === 'bugs')?.count || 0) === 0}
                  className={`p-3 rounded-lg border transition-all text-left relative overflow-visible ${
                    (sections.find(s => s.type === 'bugs')?.count || 0) > 0
                      ? "bg-slate-700/50 border-slate-600 hover:bg-slate-700 hover:border-blue-500 cursor-pointer"
                      : "bg-slate-800/30 border-slate-700 cursor-default opacity-50"
                  }`}
                  title="Jump to Bugs section"
                >
                  {(sections.find(s => s.type === 'bugs')?.count || 0) > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center leading-tight shadow-lg border-2 border-slate-800">
                      {sections.find(s => s.type === 'bugs')?.count}
                    </span>
                  )}
                  <div className="mb-1">
                    <span className="text-sm font-semibold text-slate-300">Bugs</span>
                  </div>
                  <div className="text-xs text-slate-500">Logic errors</div>
                </button>
                <button
                  onClick={() => setActiveSection("performance")}
                  disabled={(sections.find(s => s.type === 'performance')?.count || 0) === 0}
                  className={`p-3 rounded-lg border transition-all text-left relative overflow-visible ${
                    (sections.find(s => s.type === 'performance')?.count || 0) > 0
                      ? "bg-slate-700/50 border-slate-600 hover:bg-slate-700 hover:border-blue-500 cursor-pointer"
                      : "bg-slate-800/30 border-slate-700 cursor-default opacity-50"
                  }`}
                  title="Jump to Performance section"
                >
                  {(sections.find(s => s.type === 'performance')?.count || 0) > 0 && (
                    <span className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center leading-tight shadow-lg border-2 border-slate-800">
                      {sections.find(s => s.type === 'performance')?.count}
                    </span>
                  )}
                  <div className="mb-1">
                    <span className="text-sm font-semibold text-slate-300">Performance</span>
                  </div>
                  <div className="text-xs text-slate-500">Optimization</div>
                </button>
                <button
                  onClick={() => setActiveSection("security")}
                  disabled={(sections.find(s => s.type === 'security')?.count || 0) === 0}
                  className={`p-3 rounded-lg border transition-all text-left relative overflow-visible ${
                    (sections.find(s => s.type === 'security')?.count || 0) > 0
                      ? "bg-slate-700/50 border-slate-600 hover:bg-slate-700 hover:border-blue-500 cursor-pointer"
                      : "bg-slate-800/30 border-slate-700 cursor-default opacity-50"
                  }`}
                  title="Jump to Security section"
                >
                  {(sections.find(s => s.type === 'security')?.count || 0) > 0 && (
                    <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center leading-tight shadow-lg border-2 border-slate-800">
                      {sections.find(s => s.type === 'security')?.count}
                    </span>
                  )}
                  <div className="mb-1">
                    <span className="text-sm font-semibold text-slate-300">Security</span>
                  </div>
                  <div className="text-xs text-slate-500">Vulnerabilities</div>
                </button>
                <button
                  onClick={() => setActiveSection("best-practices")}
                  disabled={(sections.find(s => s.type === 'best-practices')?.count || 0) === 0}
                  className={`p-3 rounded-lg border transition-all text-left relative overflow-visible ${
                    (sections.find(s => s.type === 'best-practices')?.count || 0) > 0
                      ? "bg-slate-700/50 border-slate-600 hover:bg-slate-700 hover:border-blue-500 cursor-pointer"
                      : "bg-slate-800/30 border-slate-700 cursor-default opacity-50"
                  }`}
                  title="Jump to Best Practices section"
                >
                  {(sections.find(s => s.type === 'best-practices')?.count || 0) > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center leading-tight shadow-lg border-2 border-slate-800">
                      {sections.find(s => s.type === 'best-practices')?.count}
                    </span>
                  )}
                  <div className="mb-1">
                    <span className="text-sm font-semibold text-slate-300 whitespace-nowrap">Best Practices</span>
                  </div>
                  <div className="text-xs text-slate-500">Code quality</div>
                </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
