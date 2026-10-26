/**
 * quiz-ai-intimacy.js — แบบทดสอบ "คุณสนิทกับปัญญาประดิษฐ์แค่ไหน?"
 * ------------------------------------------------------------------
 * Topic: AI Intimacy
 * Page:  quiz-ai-intimacy.html
 * Questions, scale, and result copy live in this file.
 * Logic: quiz-engine.js — sum of 5 answers (1–5) graded with If / Else:
 *   5–10  → 🟢 ดี            ผู้ที่ยังมีคนร่วมเรื่อง (The Shared Story)
 *   11–18 → 🟡 ปานกลาง       ผู้ที่เล่ากับเครื่องก่อน (The First Confidant)
 *   19–25 → 🔴 ต้องปรับปรุง   ผู้ที่ให้เครื่องเป็นที่เล่าหลัก (The Main Listener)
 * Storage: pp_quiz_ai-intimacy_history / pp_quiz_ai-intimacy_progress
 */
window.MindLensQuiz.init({
  slug: 'ai-intimacy',
  name: 'AI Intimacy',

  prompt: 'เมื่อได้คุยกับแชทบอทหรือระบบที่ตอบเป็นข้อความ สิ่งนี้เกิดขึ้นบ่อยแค่ไหน?',

  questions: [
    { id: 'only-here', tag: 'The Only Ear', label: 'เล่าที่นี่อย่างเดียว', icon: 'fa-comment-dots', text: 'ฉันเล่าเรื่องที่ยังไม่เคยเล่าให้คนรู้จักฟัง ให้แชทบอทฟังก่อน' },
    { id: 'easier', tag: 'The Easier Ear', label: 'เล่ากับเครื่องง่ายกว่า', icon: 'fa-heart', text: 'ฉันเล่าเรื่องหนักใจกับแชทบอทได้ง่ายกว่าเล่ากับคน เพราะรู้สึกว่ามันไม่ตัดสิน' },
    { id: 'closer', tag: 'The Closer Reply', label: 'รู้สึกสนิทกว่าคน', icon: 'fa-user', text: 'ฉันรู้สึกว่าแชทบอทเข้าใจฉันมากกว่าคนที่อยู่รอบตัว' },
    { id: 'instead', tag: 'The Instead', label: 'เปิดเครื่องแทนคน', icon: 'fa-comment-slash', text: 'เมื่ออยากมีคนรับฟัง ฉันเปิดแชทบอทแทนที่จะทักคนที่รู้จัก' },
    { id: 'return', tag: 'The Return', label: 'กลับไปหาเครื่อง', icon: 'fa-clock', text: 'หลังคุยกับคนแล้วไม่โล่ง ฉันกลับไปเล่าเรื่องเดิมกับแชทบอทต่อ' }
  ],

  scale: [
    { emoji: '😌', label: 'ไม่เคยเลย' },
    { emoji: '🙂', label: 'นานๆ ครั้ง' },
    { emoji: '😐', label: 'เป็นบางครั้ง' },
    { emoji: '😟', label: 'บ่อยครั้ง' },
    { emoji: '😵‍💫', label: 'เป็นประจำ' }
  ],

  results: {
    green: {
      key: 'green',
      min: 5,
      max: 10,
      emoji: '🌱',
      zoneName: 'ระดับดี',
      titleTh: 'ผู้ที่ยังมีคนร่วมเรื่อง',
      titleEn: 'The Shared Story',
      description: 'คุณใช้เครื่องช่วยคิดหรือช่วยร่างได้ โดยเรื่องที่สำคัญยังมีคนรู้จักได้อย่างน้อยหนึ่งคนได้ยิน ช่องพิมพ์จึงยังไม่ใช่ที่เดียวของเรื่องจริง',
      advice: 'รักษาทางนี้ไว้เมื่อใจหนัก ให้มีคนหนึ่งคนได้ยินอย่างน้อยหนึ่งประโยค แล้วค่อยใช้เครื่องช่วยจัดความคิดต่อได้'
    },
    yellow: {
      key: 'yellow',
      min: 11,
      max: 18,
      emoji: '💬',
      zoneName: 'ระดับปานกลาง',
      titleTh: 'ผู้ที่เล่ากับเครื่องก่อน',
      titleEn: 'The First Confidant',
      description: 'คุณยังมีคนในชีวิต แต่เรื่องหนักมักไปที่แชทบอทก่อน เพราะมันตอบทันทีและไม่ตัดสิน คนรู้จักจึงได้ยินเรื่องนั้นช้ากว่า หรือยังไม่ได้ยินเลย',
      advice: 'ครั้งต่อไปก่อนเปิดแชทบอทเมื่อใจหนัก ให้ทักคนที่รู้จักหนึ่งข้อความก่อน เล่าเพียงหนึ่งประโยค แล้วค่อยกลับไปใช้เครื่องช่วยคิดได้'
    },
    red: {
      key: 'red',
      min: 19,
      max: 25,
      emoji: '🤗',
      zoneName: 'ระดับต้องปรับปรุง',
      titleTh: 'ผู้ที่ให้เครื่องเป็นที่เล่าหลัก',
      titleEn: 'The Main Listener',
      description: 'คุณมีแนวโน้มให้แชทบอทเป็นที่เล่าเรื่องจริง ก่อนคนที่รู้จัก ความโล่งจากการถูกรับฟังจึงค้างอยู่กับระบบที่ตอบทุกครั้ง',
      advice: 'เลือกหนึ่งเรื่องที่เพิ่งเล่าให้แชทบอท แล้วบอกคนที่รู้จักหนึ่งคนเพียงหนึ่งประโยคจากเรื่องนั้น ถ้าทักคนยาก ให้เริ่มจากชื่อเรื่องสั้นๆ ก่อนที่จะเล่าทั้งก้อน'
    }
  },

  articleLink: { href: 'article-ai-intimacy.html#one-person', label: 'อ่านวิธีให้เรื่องที่เล่ามีคนจริงได้ยินด้วย' },
  support: true
});
