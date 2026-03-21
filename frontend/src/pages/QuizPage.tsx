import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useParams, useLocation } from 'react-router-dom';
import { quizAPI, documentAPI } from '../services/api';
import {
  GraduationCap, Loader2, CheckCircle2, ArrowLeft,
  XCircle, Trophy, FileText, RotateCcw, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';

interface QuizQuestion {
  _id: string;
  question: string;
  options: string[];
  correctAnswer?: number;
  userAnswer?: number | null;
  explanation?: string;
}

interface QuizData {
  _id: string;
  title: string;
  totalQuestions: number;
  questions: QuizQuestion[];
  score?: number;
  correctCount?: number;
  status?: string;
  documents?: { _id: string; title: string; type: string }[];
}

interface QuizHistoryItem {
  _id: string;
  title: string;
  documents: { _id: string; title: string; type: string }[];
  totalQuestions: number;
  score: number | null;
  correctCount: number;
  status: string;
  createdAt: string;
}

interface DocOption {
  _id: string;
  title: string;
  type: string;
  selected: boolean;
}

const DOC_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  pdf: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' },
  text: { bg: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' },
  other: { bg: 'rgba(156, 163, 175, 0.12)', color: '#9ca3af' },
};

const LOADING_STEPS = [
  'Analyzing document content...',
  'Identifying key concepts...',
  'Generating questions...',
  'Crafting answer options...',
  'Finalizing quiz...',
];

export default function QuizPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { quizId } = useParams();
  const [searchParams] = useSearchParams();
  const preselectedDocs = searchParams.get('docs')?.split(',').filter(Boolean) || [];

  const [mode, setMode] = useState<string>('select');
  const [documents, setDocuments] = useState<DocOption[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [results, setResults] = useState<any>(null);
  const [history, setHistory] = useState<QuizHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingInterval = useRef<any>(null);
  const [showQuestionCountModal, setShowQuestionCountModal] = useState(false);
  const [questionCount, setQuestionCount] = useState(5);

  useEffect(() => {
    loadDocuments();
    loadHistory();
  }, []);

  // Set mode based on URL path
  useEffect(() => {
    if (location.pathname === '/quiz/history' && !quizId) {
      setMode('history');
    }
  }, [location.pathname]);

  // Load quiz from URL param on mount
  useEffect(() => {
    if (quizId) {
      loadQuizDetail(quizId);
    } else if (preselectedDocs.length > 0 && !docsLoading) {
      generateQuiz(preselectedDocs);
    }
  }, [quizId, docsLoading]);

  const startLoadingAnimation = () => {
    setLoadingStep(0);
    let step = 0;
    loadingInterval.current = setInterval(() => {
      step++;
      if (step < LOADING_STEPS.length) {
        setLoadingStep(step);
      }
    }, 2200);
  };

  const stopLoadingAnimation = () => {
    if (loadingInterval.current) {
      clearInterval(loadingInterval.current);
      loadingInterval.current = null;
    }
  };

  const loadDocuments = async () => {
    try {
      const res = await documentAPI.getAll({ limit: 50 });
      const docs = (res as any).data?.documents || [];
      setDocuments(docs.map((d: any) => ({
        _id: d._id,
        title: d.title,
        type: d.type,
        selected: preselectedDocs.includes(d._id),
      })));
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setDocsLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await quizAPI.history();
      setHistory((res as any).data || []);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  };

  const toggleDoc = (id: string) => {
    setDocuments(prev => {
      const selected = prev.filter(d => d.selected).length;
      return prev.map(d => {
        if (d._id !== id) return d;
        if (!d.selected && selected >= 10) {
          toast.error('Maximum 10 documents');
          return d;
        }
        return { ...d, selected: !d.selected };
      });
    });
  };

  const generateQuiz = async (docIds?: string[]) => {
    const selectedIds = docIds || documents.filter(d => d.selected).map(d => d._id);
    if (selectedIds.length === 0) {
      toast.error('Select at least one document');
      return;
    }

    setShowQuestionCountModal(false);
    setGenerating(true);
    setMode('loading');
    startLoadingAnimation();
    try {
      const res = await quizAPI.generate({ documentId: selectedIds[0], numberOfQuestions: questionCount });
      const quizData = (res as any).data;
      setQuiz(quizData);
      setAnswers({});
      setCurrentQ(0);
      setResults(null);
      // Navigate to the quiz URL so refresh works
      navigate(`/quiz/${quizData._id}`, { replace: true });
      setMode('taking');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate quiz');
      setMode('select');
    } finally {
      setGenerating(false);
      stopLoadingAnimation();
      // Refresh history so newly created quiz appears immediately
      loadHistory();
    }
  };

  const selectAnswer = (questionId: string, optionIndex: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  const submitQuiz = async () => {
    if (!quiz) return;
    setSubmitting(true);
    try {
      // Convert answers object {questionId: optionIndex} to positional array
      const answersArray = quiz.questions.map((q: any) => answers[q._id] ?? -1);
      const res = await quizAPI.submit(quiz._id, { answers: answersArray });
      const submitData = (res as any).data;
      setResults({
        score: submitData.percentage,
        correctCount: submitData.score,
        totalQuestions: submitData.total,
        results: submitData.questions.map((q: any) => ({
          ...q,
          isCorrect: q.userAnswer === q.correctAnswer,
        })),
      });
      setMode('results');
      loadHistory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit quiz');
    } finally {
      setSubmitting(false);
    }
  };

  const loadQuizDetail = async (id: string) => {
    try {
      setMode('loading');
      startLoadingAnimation();
      const res = await quizAPI.getById(id);
      const data = (res as any).data;
      setQuiz(data);
      if (data.completedAt) {
        setResults({
          score: data.totalQuestions > 0 ? Math.round((data.score / data.totalQuestions) * 100) : 0,
          correctCount: data.score,
          totalQuestions: data.totalQuestions,
          results: data.questions.map((q: any) => ({
            ...q,
            isCorrect: q.userAnswer === q.correctAnswer,
          })),
        });
        setMode('results');
      } else {
        setAnswers({});
        setCurrentQ(0);
        setMode('taking');
      }
    } catch {
      toast.error('Failed to load quiz');
      navigate('/quiz', { replace: true });
      setMode('select');
    } finally {
      stopLoadingAnimation();
    }
  };

  const retakeQuiz = () => {
    if (quiz?.documents) {
      generateQuiz(quiz.documents.map(d => d._id));
    } else {
      const docIds = documents.filter(d => d.selected).map(d => d._id);
      if (docIds.length > 0) {
        generateQuiz(docIds);
      } else {
        goBack();
      }
    }
  };

  const goBack = () => {
    navigate('/quiz', { replace: true });
    setMode('select');
    setQuiz(null);
    setResults(null);
    setAnswers({});
    setCurrentQ(0);
    loadHistory();
  };

  const getTypeStyle = (type: string) => DOC_TYPE_COLORS[type] || DOC_TYPE_COLORS.other;

  // Loading state — animated multi-step
  if (mode === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 20 }}>
        <div className="quiz-loading-ring">
          <GraduationCap size={28} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Generating Your Quiz
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, minHeight: 20, transition: 'opacity 0.3s' }}>
            {LOADING_STEPS[loadingStep]}
          </p>
        </div>
        <div style={{ width: 200, height: 4, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
          <div className="quiz-loading-bar" />
        </div>
      </div>
    );
  }

  // Document selection / history mode
  if (mode === 'select' || mode === 'history') {
    const selectedCount = documents.filter(d => d.selected).length;

    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Tab bar — sticky */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, position: 'sticky', top: 0, zIndex: 10, background: '#08080c', paddingTop: 4, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <button
            className={`quiz-tab ${mode === 'select' ? 'active' : ''}`}
            onClick={() => { setMode('select'); navigate('/quiz', { replace: true }); }}
          >
            <GraduationCap size={16} /> New Quiz
          </button>
          <button
            className={`quiz-tab ${mode === 'history' ? 'active' : ''}`}
            onClick={() => { setMode('history'); navigate('/quiz/history', { replace: true }); }}
          >
            <Clock size={16} /> History
          </button>
        </div>

        {mode === 'select' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                Select Documents for Quiz
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Choose up to 10 documents to generate a quiz from.
              </p>
            </div>

            {docsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}>
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : (
              <>
                <div className="quiz-doc-grid">
                  {documents.map(doc => {
                    const typeStyle = getTypeStyle(doc.type);
                    return (
                      <button
                        key={doc._id}
                        className={`quiz-doc-card ${doc.selected ? 'selected' : ''}`}
                        onClick={() => toggleDoc(doc._id)}
                      >
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: doc.selected ? 'rgba(99,102,241,0.12)' : typeStyle.bg, flexShrink: 0,
                        }}>
                          <FileText size={18} style={{ color: doc.selected ? 'var(--accent-primary)' : typeStyle.color }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.title}
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                            padding: '2px 6px', borderRadius: 4,
                            background: typeStyle.bg, color: typeStyle.color,
                          }}>
                            {doc.type}
                          </span>
                        </div>
                        {doc.selected && <CheckCircle2 size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center' }}>
                    {selectedCount} selected
                  </span>
                  <button
                    className="btn btn-primary"
                    disabled={selectedCount === 0 || generating}
                    onClick={() => setShowQuestionCountModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {generating ? <Loader2 size={16} className="animate-spin" /> : <GraduationCap size={16} />}
                    Generate Quiz
                  </button>
                </div>

                {/* Question count modal */}
                {showQuestionCountModal && (
                  <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowQuestionCountModal(false); }}>
                    <div className="modal-content" style={{ maxWidth: 400, width: '90%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Quiz Mode</h3>
                        <button onClick={() => setShowQuestionCountModal(false)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                          <XCircle size={16} />
                        </button>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                        Choose <strong style={{ color: 'var(--text-secondary)' }}>5 Questions</strong> for a quick quiz, or <strong style={{ color: 'var(--text-secondary)' }}>Random</strong> to let the AI decide based on your document.
                      </p>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                        <button
                          className="gen-chip"
                          onClick={() => setQuestionCount(5)}
                          style={{
                            flex: 1, padding: '14px 16px', fontSize: 14, fontWeight: 600, borderRadius: 10,
                            ...(questionCount === 5 ? { borderColor: 'var(--accent-primary)', background: 'rgba(124,58,237,0.1)', color: 'var(--accent-primary)' } : {}),
                          }}
                        >
                          5 Questions
                        </button>
                        <button
                          className="gen-chip"
                          onClick={() => setQuestionCount(0)}
                          style={{
                            flex: 1, padding: '14px 16px', fontSize: 14, fontWeight: 600, borderRadius: 10,
                            ...(questionCount === 0 ? { borderColor: 'var(--accent-primary)', background: 'rgba(124,58,237,0.1)', color: 'var(--accent-primary)' } : {}),
                          }}
                        >
                          Random
                        </button>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button className="btn" onClick={() => setShowQuestionCountModal(false)}
                          style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
                        <button className="btn btn-primary" onClick={() => generateQuiz()}
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <GraduationCap size={14} /> Start Quiz
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {mode === 'history' && (
          <>
            {historyLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}>
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : history.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><GraduationCap size={32} /></div>
                <h3 className="empty-state-title">No quizzes yet</h3>
                <p className="empty-state-desc">Generate your first quiz to test your knowledge!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map(h => (
                  <button
                    key={h._id}
                    className="quiz-history-card"
                    onClick={() => navigate(`/quiz/${h._id}`)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{h.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>{h.totalQuestions} questions</span>
                        <span>·</span>
                        <span>{new Date(h.createdAt).toLocaleDateString()}</span>
                        {h.documents?.map((d, i) => (
                          <span key={i} className="badge badge-blue" style={{ fontSize: 10 }}>{d.title}</span>
                        ))}
                      </div>
                    </div>
                    {h.status === 'completed' ? (
                      <div className={`quiz-score-badge ${h.score! >= 70 ? 'good' : h.score! >= 40 ? 'ok' : 'poor'}`}>
                        {h.score}%
                      </div>
                    ) : (
                      <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', fontSize: 11 }}>Pending</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Taking quiz mode
  if (mode === 'taking' && quiz) {
    const q = quiz.questions[currentQ];
    const totalAnswered = Object.keys(answers).length;
    const allAnswered = totalAnswered === quiz.totalQuestions;

    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* Back + Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={goBack} className="btn btn-ghost btn-icon btn-sm" title="Back to quiz list"
            style={{ width: 34, height: 34, flexShrink: 0 }}>
            <ArrowLeft size={18} />
          </button>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {quiz.title}
          </h2>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0 }}>
            {totalAnswered}/{quiz.totalQuestions} answered
          </span>
        </div>

        <div className="quiz-progress-bar">
          <div className="quiz-progress-fill" style={{ width: `${(totalAnswered / quiz.totalQuestions) * 100}%` }} />
        </div>

        {/* Question */}
        <div className="quiz-question-card">
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>
            Question {currentQ + 1} of {quiz.totalQuestions}
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 24 }}>
            {q.question}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {q.options.map((opt, i) => (
              <button
                key={i}
                className={`quiz-option ${answers[q._id] === i ? 'selected' : ''}`}
                onClick={() => selectAnswer(q._id, i)}
              >
                <span className="quiz-option-letter">{String.fromCharCode(65 + i)}</span>
                <span>{opt}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button
            className="btn"
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            disabled={currentQ === 0}
            onClick={() => setCurrentQ(prev => prev - 1)}
          >
            Previous
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            {currentQ < quiz.totalQuestions - 1 ? (
              <button className="btn btn-primary" onClick={() => setCurrentQ(prev => prev + 1)}>
                Next
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={!allAnswered || submitting}
                onClick={submitQuiz}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Submit Quiz
              </button>
            )}
          </div>
        </div>

        {/* Question dots — paginated with ellipsis for >10 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          {(() => {
            const total = quiz.questions.length;
            const cur = currentQ;

            // Show all dots if 10 or fewer
            if (total <= 10) {
              return quiz.questions.map((qItem, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentQ(i)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700,
                    background: i === cur ? 'var(--accent-primary)' : answers[qItem._id] !== undefined ? 'var(--surface-3)' : 'var(--surface-1)',
                    color: i === cur ? 'white' : answers[qItem._id] !== undefined ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: `1.5px solid ${i === cur ? 'var(--accent-primary)' : 'var(--border)'}`,
                  }}
                >
                  {i + 1}
                </button>
              ));
            }

            // Build visible indices: always show first, last, current, and neighbors of current
            const visible = new Set<number>();
            visible.add(0);
            visible.add(total - 1);
            for (let d = -1; d <= 1; d++) {
              const idx = cur + d;
              if (idx >= 0 && idx < total) visible.add(idx);
            }
            const sorted = [...visible].sort((a, b) => a - b);

            const elements: JSX.Element[] = [];
            let prev = -1;
            for (const i of sorted) {
              if (prev !== -1 && i - prev > 1) {
                elements.push(
                  <span key={`e${i}`} style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, userSelect: 'none', padding: '0 2px' }}>…</span>
                );
              }
              const qItem = quiz.questions[i];
              elements.push(
                <button
                  key={i}
                  onClick={() => setCurrentQ(i)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700,
                    background: i === cur ? 'var(--accent-primary)' : answers[qItem._id] !== undefined ? 'var(--surface-3)' : 'var(--surface-1)',
                    color: i === cur ? 'white' : answers[qItem._id] !== undefined ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: `1.5px solid ${i === cur ? 'var(--accent-primary)' : 'var(--border)'}`,
                  }}
                >
                  {i + 1}
                </button>
              );
              prev = i;
            }
            return elements;
          })()}
        </div>
      </div>
    );
  }

  // Results mode
  if (mode === 'results' && results) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* Back button */}
        <button onClick={goBack} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: '4px 0',
        }}>
          <ArrowLeft size={16} /> Back to Quizzes
        </button>

        {/* Score header */}
        <div className="quiz-result-header">
          <Trophy size={36} style={{ color: results.score >= 70 ? '#10b981' : results.score >= 40 ? '#f59e0b' : '#ef4444' }} />
          <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--text-primary)' }}>{results.score}%</div>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
            {results.correctCount} of {results.totalQuestions} correct
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={retakeQuiz} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RotateCcw size={14} /> Retake Quiz
            </button>
            <button
              className="btn"
              style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              onClick={goBack}
            >
              New Quiz
            </button>
          </div>
        </div>

        {/* Review answers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
          {results.results.map((r: any, i: number) => (
            <div key={i} className="quiz-review-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                {r.isCorrect
                  ? <CheckCircle2 size={20} style={{ color: '#10b981', flexShrink: 0, marginTop: 2 }} />
                  : <XCircle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />}
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {r.question}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 30 }}>
                {r.options.map((opt: string, j: number) => {
                  const isCorrect = j === r.correctAnswer;
                  const isUserAnswer = j === r.userAnswer;
                  let bg = 'transparent';
                  let bColor = 'var(--border)';
                  let txtColor = 'var(--text-secondary)';
                  if (isCorrect) { bg = 'rgba(16,185,129,0.1)'; bColor = '#10b981'; txtColor = '#10b981'; }
                  if (isUserAnswer && !isCorrect) { bg = 'rgba(239,68,68,0.1)'; bColor = '#ef4444'; txtColor = '#ef4444'; }
                  return (
                    <div key={j} style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${bColor}`, background: bg, fontSize: 13, color: txtColor }}>
                      <span style={{ fontWeight: 700, marginRight: 8 }}>{String.fromCharCode(65 + j)}</span>
                      {opt}
                    </div>
                  );
                })}
              </div>
              {r.explanation && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10, marginLeft: 30, lineHeight: 1.6 }}>
                  💡 {r.explanation}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Navigate to source documents */}
        {quiz?.documents && quiz.documents.length > 0 && (
          <div style={{ marginTop: 24, padding: 16, background: 'var(--surface-1)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>Source Documents</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {quiz.documents.map((d, i) => (
                <button
                  key={i}
                  className="tag-chip-v2"
                  onClick={() => navigate(`/documents/${d._id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <FileText size={12} /> {d.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
