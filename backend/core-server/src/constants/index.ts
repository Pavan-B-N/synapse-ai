/**
 * Core server constants — channel categories, limits, and enums.
 */

/** Predefined channel categories available for user selection */
export const CHANNEL_CATEGORIES = [
  // Technology & CS
  'Artificial Intelligence', 'Machine Learning', 'Deep Learning', 'Natural Language Processing',
  'Computer Vision', 'Data Science', 'Data Engineering', 'Big Data', 'Cloud Computing',
  'DevOps', 'Cybersecurity', 'Blockchain', 'Web Development', 'Frontend Development',
  'Backend Development', 'Full Stack Development', 'Mobile Development', 'iOS Development',
  'Android Development', 'Game Development', 'Embedded Systems', 'IoT', 'Robotics',
  'Quantum Computing', 'AR/VR', 'UI/UX Design', 'Database Systems', 'Networking',
  'Operating Systems', 'Compiler Design', 'Distributed Systems', 'Microservices',
  'API Development', 'Software Engineering', 'System Design', 'Algorithms',
  'Data Structures', 'Competitive Programming',
  // Programming Languages
  'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Swift',
  'Kotlin', 'Ruby', 'PHP', 'R', 'Scala', 'Dart', 'SQL',
  // Frameworks & Tools
  'React', 'Angular', 'Vue.js', 'Node.js', 'Django', 'Flask', 'Spring Boot',
  'Docker', 'Kubernetes', 'Terraform', 'AWS', 'Azure', 'GCP', 'Linux', 'Git',
  // Science & Math
  'Mathematics', 'Statistics', 'Linear Algebra', 'Calculus', 'Discrete Mathematics',
  'Physics', 'Chemistry', 'Biology', 'Astronomy', 'Environmental Science',
  // Engineering
  'Electrical Engineering', 'Mechanical Engineering', 'Civil Engineering',
  'Chemical Engineering', 'Aerospace Engineering', 'Biomedical Engineering',
  // Business & Management
  'Business', 'Entrepreneurship', 'Product Management', 'Project Management',
  'Marketing', 'Finance', 'Accounting', 'Economics', 'Supply Chain',
  // Humanities & Social
  'Psychology', 'Philosophy', 'Sociology', 'Political Science', 'History',
  'Literature', 'Linguistics', 'Communication', 'Journalism',
  // Creative & Design
  'Graphic Design', 'Animation', 'Video Editing', 'Photography', 'Music',
  'Creative Writing', '3D Modeling',
  // Education & Career
  'Teaching', 'Study Skills', 'Career Development', 'Interview Prep',
  'Resume Building', 'Public Speaking', 'Leadership',
  // Health & Wellness
  'Health Science', 'Nutrition', 'Mental Health', 'Fitness',
  // Miscellaneous
  'General Knowledge', 'Current Affairs', 'Language Learning',
  'Research Methods', 'Academic Writing', 'Open Source', 'Ethics in Tech',
  'Sustainability', 'Personal Finance', 'Productivity',
] as const;

export type ChannelCategory = (typeof CHANNEL_CATEGORIES)[number];
