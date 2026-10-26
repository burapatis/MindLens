/**
 * quiz-home-scarcity.js — แบบทดสอบ "คุณใจแคบกับคนใกล้ตัวแค่ไหนเมื่อของไม่พอ?"
 * ------------------------------------------------------------------
 * Topic: Home Scarcity
 * Page:  quiz-home-scarcity.html
 * Questions, scale, and result copy live in this file.
 * Logic: quiz-engine.js — sum of 5 answers (1–5) graded with If / Else:
 *   5–10  → 🟢 ดี            ผู้ที่ยังแยกเรื่องขาดออกจากคน (The Named Shortage)
 *   11–18 → 🟡 ปานกลาง       ผู้ที่ใจแคบบางวัน (The Tight Day)
 *   19–25 → 🔴 ต้องปรับปรุง   ผู้ที่ให้คนใกล้รับความขาด (The Short Home)
 * Storage: pp_quiz_home-scarcity_history / pp_quiz_home-scarcity_progress
 */
window.MindLensQuiz.init({
  slug: 'home-scarcity',
  name: 'Home Scarcity',

  prompt: 'เมื่อเงินหรือเวลาไม่พอในแต่ละวัน สิ่งนี้เกิดขึ้นบ่อยแค่ไหนกับคนใกล้ตัว?',

  questions: [
    { id: 'short-reply', tag: 'The Short Reply', label: 'ตอบสั้นกับคนใกล้', icon: 'fa-comment-slash', text: 'เมื่อบิลหรือนาฬิกากำลังกดอยู่ ฉันตอบคนในบ้านสั้นหรือคมกว่าเรื่องที่เขาถาม' },
    { id: 'spill', tag: 'The Spill', label: 'เรื่องขาดลามไปคน', icon: 'fa-house', text: 'ความกังวลเรื่องเงินหรือเวลาลามไปเป็นการต่อว่าคนที่อยู่ใกล้ ทั้งที่เขาไม่ได้เป็นต้นเหตุ' },
    { id: 'full-mind', tag: 'The Full Mind', label: 'หัวเต็มจนไม่ได้ยิน', icon: 'fa-hourglass-half', text: 'ฉันได้ยินคำถามของคนใกล้ตัวไม่ครบ เพราะหัวกำลังคิดเรื่องที่ขาดอยู่' },
    { id: 'repeat', tag: 'The Repeat', label: 'พูดแรงซ้ำ', icon: 'fa-bolt', text: 'ฉันพูดแรงกับคนเดิมซ้ำในวันเดียวกัน หลังเรื่องเงินหรือเวลายังไม่จบ' },
    { id: 'unnamed', tag: 'The Unnamed', label: 'ไม่บอกว่าอะไรขาด', icon: 'fa-comment-dots', text: 'ฉันไม่บอกว่ากำลังขาดเงินหรือเวลา แล้วให้คนใกล้ตัวรับน้ำเสียงนั้นไปทั้งก้อน' }
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
      emoji: '🏠',
      zoneName: 'ระดับดี',
      titleTh: 'ผู้ที่ยังแยกเรื่องขาดออกจากคน',
      titleEn: 'The Named Shortage',
      description: 'วันที่เงินหรือเวลาไม่พอ คุณยังพอแยกของที่ขาดออกจากคนที่ยืนอยู่ตรงหน้า คนใกล้ตัวจึงได้ยินเรื่อง ไม่ได้ยินว่าเขาคือปัญหา',
      advice: 'รักษาการเรียกชื่อของที่ขาดแบบนี้ไว้ คำว่าบิลหรือนาฬิกา ทำให้ประโยคถัดไปมีที่อยู่ และคนใกล้ตัวไม่ต้องเดาว่าเขาทำอะไรผิด'
    },
    yellow: {
      key: 'yellow',
      min: 11,
      max: 18,
      emoji: '⏳',
      zoneName: 'ระดับปานกลาง',
      titleTh: 'ผู้ที่ใจแคบบางวัน',
      titleEn: 'The Tight Day',
      description: 'คุณพอรู้ว่าคนใกล้ตัวไม่ใช่ต้นเหตุ แต่บางวันที่ของไม่พอ คำตอบยังสั้นกว่าเรื่องที่เขาถาม และเรื่องขาดลามไปที่น้ำเสียง',
      advice: 'ครั้งต่อไปก่อนตอบสั้น ให้บอกหนึ่งคำว่าตอนนี้ขาดอะไร แล้วหยุดหนึ่งนาที ก่อนพูดประโยคถัดไปกับคนนั้น'
    },
    red: {
      key: 'red',
      min: 19,
      max: 25,
      emoji: '🗣️',
      zoneName: 'ระดับต้องปรับปรุง',
      titleTh: 'ผู้ที่ให้คนใกล้รับความขาด',
      titleEn: 'The Short Home',
      description: 'คุณมีแนวโน้มให้คนในบ้านรับความตึงของเงินหรือเวลา ทั้งก้อน คำถามธรรมดาจึงเจอคำตอบที่คม และเรื่องที่ขาดไม่ถูกเรียกชื่อ',
      advice: 'เลือกหนึ่งคนที่คุณพูดแรงบ่อยในวันที่ของไม่พอ ก่อนตอบเขา ให้บอกว่าขาดเงินหรือเวลา หยุดหนึ่งนาที แล้วพูดหนึ่งประโยคที่ไม่เกี่ยวกับของที่ขาด'
    }
  },

  articleLink: { href: 'article-home-scarcity.html#at-home', label: 'อ่านวิธีไม่ให้คนใกล้ตัวรับความขาดทั้งก้อน' },
  support: true
});
