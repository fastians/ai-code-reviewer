import { useState } from "react";
import { Copy, X } from "lucide-react";

function App() {
  const [code, setCode] = useState("");
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleReview = async () => {
    if (!code.trim()) return;

    setLoading(true);
    setError("");
    setReview("");

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_OPENAI_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a senior software engineer. Review the code and provide specific feedback on: bugs, performance, security, and best practices. Be concise but actionable. Format with markdown.",
              },
              {
                role: "user",
                content: `Review this code:\n\n${code}`,
              },
            ],
            max_tokens: 1000,
          }),
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      setReview(data.choices[0].message.content);
    } catch (err: any) {
      setError(err.message || "Failed to review code");
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
              className="w-full h-96 bg-slate-900 rounded p-4 font-mono text-sm border border-slate-600 focus:border-blue-500 focus:outline-none resize-none"
            />
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
                  <pre className="whitespace-pre-wrap text-slate-300">
                    {review}
                  </pre>
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
