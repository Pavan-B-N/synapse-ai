import Quiz from '../../models/Quiz';
import { aiClient } from '../client/AIClient';
import { documentClient } from '../client/DocumentClient';
import { AppError, NotFoundError, ValidationError } from '../errors';
import logger from '../../Logger';

class QuizHandler {
  async generate(userId: string, documentId: string, numberOfQuestions: number = 5, difficulty: string = 'medium', raid?: string) {
    logger.info('Quiz.generate: fetching document content', { raid, userId, meta: { documentId } });
    const doc = await documentClient.getDocumentContent(documentId, userId, raid);
    logger.info('Quiz.generate: document fetched', { raid, userId, meta: { documentId, title: doc.title, contentLen: doc.content.length } });

    const isRandom = numberOfQuestions === 0;
    const questionInstruction = isRandom
      ? 'Generate between 5 and 25 quiz questions based on the depth and breadth of the content. For short or simple content, generate closer to 5. For rich, detailed content, generate up to 25. Vary the count naturally — do NOT always default to 10.'
      : `Generate exactly ${numberOfQuestions} quiz questions at ${difficulty} difficulty level.`;

    const prompt = `Based on the following document content, ${questionInstruction}

Document Title: ${doc.title}
Document Content (first 6000 chars): ${doc.content.substring(0, 6000)}

Return a valid JSON array of objects with this exact structure:
[{"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correctAnswer": 0, "explanation": "..."}]

Where correctAnswer is the 0-based index of the correct option. Each question must have exactly 4 options.`;

    const estimatedQuestions = isRandom ? 25 : numberOfQuestions;
    const maxTokens = Math.max(1500, estimatedQuestions * 150);
    logger.info('Quiz.generate: calling AI to generate questions', { raid, userId, meta: { documentId, difficulty, estimatedQuestions, maxTokens } });
    const aiResponse = await aiClient.generateText(prompt, 'You are a quiz generation assistant. Always return valid JSON arrays only, no extra text.', maxTokens, raid);
    logger.info('Quiz.generate: AI response received, parsing questions', { raid, userId, meta: { responseLen: aiResponse.length } });

    let questions: any[];
    try {
      const cleaned = aiResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      questions = JSON.parse(cleaned);
    } catch {
      throw new AppError('Failed to parse AI-generated quiz questions', 500);
    }

    const quiz = await Quiz.create({
      userId, documentId,
      title: `Quiz: ${doc.title}`,
      questions: questions.map((q: any) => ({
        question: q.question, options: q.options,
        correctAnswer: q.correctAnswer, explanation: q.explanation || '',
      })),
      difficulty, totalQuestions: questions.length,
    });
    logger.info('Quiz.generate: quiz created', { raid, userId, meta: { quizId: quiz._id.toString(), questionCount: questions.length, difficulty } });

    return this.stripAnswers(quiz.toObject());
  }

  async submit(userId: string, quizId: string, answers: number[]) {
    const quiz = await Quiz.findOne({ _id: quizId, userId });
    if (!quiz) throw new NotFoundError('Quiz not found');
    if (quiz.completedAt) throw new ValidationError('Quiz already submitted');
    if (!Array.isArray(answers)) throw new ValidationError('answers must be an array');

    logger.info('Quiz.submit: scoring quiz', { userId, meta: { quizId, answerCount: answers.length, totalQuestions: quiz.questions.length } });

    let score = 0;
    quiz.questions.forEach((q: any, i: number) => {
      const userAnswer = answers[i] ?? -1;
      q.userAnswer = userAnswer;
      if (userAnswer === q.correctAnswer) score++;
    });

    quiz.score = Math.round((score / quiz.questions.length) * 100);
    quiz.correctCount = score;
    quiz.totalQuestions = quiz.questions.length;
    quiz.status = 'completed';
    quiz.completedAt = new Date();
    await quiz.save();
    logger.info('Quiz.submit: quiz scored', { userId, meta: { quizId, score, total: quiz.questions.length, percentage: quiz.score } });

    return { quizId: quiz._id, score, total: quiz.questions.length, percentage: quiz.score, questions: quiz.questions };
  }

  async getHistory(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [quizzes, total] = await Promise.all([
      Quiz.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-questions.correctAnswer -questions.explanation'),
      Quiz.countDocuments({ userId }),
    ]);
    return { quizzes, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getById(userId: string, quizId: string) {
    const quiz = await Quiz.findOne({ _id: quizId, userId });
    if (!quiz) throw new NotFoundError('Quiz not found');
    return quiz.completedAt ? quiz : this.stripAnswers(quiz.toObject());
  }

  private stripAnswers(quiz: any) {
    quiz.questions = quiz.questions.map((q: any) => {
      const { correctAnswer, explanation, ...rest } = q;
      return rest;
    });
    return quiz;
  }
}

export default new QuizHandler();
