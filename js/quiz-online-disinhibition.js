/**
 * quiz-online-disinhibition.js — แบบทดสอบ "คุณพูดในแชทรุนแรงกว่าพูดต่อหน้าแค่ไหน?"
 * ------------------------------------------------------------------
 * Topic: Online Disinhibition
 * Page:  quiz-online-disinhibition.html
 * Questions, scale, and result copy live in this file.
 * Logic: quiz-engine.js — sum of 5 answers (1–5) graded with If / Else:
 *   5–10  → 🟢 ดี            ผู้ที่พิมพ์ใกล้คำพูด (The Table Voice)
 *   11–18 → 🟡 ปานกลาง       ผู้ที่พิมพ์คมกว่าปกติ (The Sharper Line)
 *   19–25 → 🔴 ต้องปรับปรุง   ผู้ที่พูดในแชทแรงกว่าต่อหน้า (The Unseen Tone)
 * Storage: pp_quiz_online-disinhibition_history / pp_quiz_online-disinhibition_progress
 */
window.MindLensQuiz.init({
  slug: 'online-disinhibition',
  name: 'Online Disinhibition',

  prompt: 'เมื่อคุยกับคนที่รู้จักในแชท สิ่งนี้เกิดขึ้นบ่อยแค่ไหน?',

  questions: [
    { id: 'sharper', tag: 'The Sharper Line', label: 'พิมพ์แรงกว่าพูด', icon: 'fa-bolt', text: 'ข้อความที่ฉันพิมพ์ถึงคนที่รู้จัก แรงกว่าคำที่ฉันจะพูดถ้าเขานั่งอยู่ตรงหน้า' },
    { id: 'no-face', tag: 'The Missing Face', label: 'ไม่เห็นสีหน้า', icon: 'fa-eye', text: 'เมื่อไม่เห็นสีหน้า ฉันพิมพ์ต่อทั้งที่รู้ว่าประโยคนั้นคมกว่าที่ตั้งใจ' },
    { id: 'leave', tag: 'The Exit', label: 'ส่งแล้วออกจากแชท', icon: 'fa-paper-plane', text: 'ฉันกดส่งข้อความที่แรง แล้วออกจากแชทก่อนจะเห็นว่าอีกฝ่ายรับอย่างไร' },
    { id: 'voice', tag: 'The Voice I Added', label: 'ใส่เสียงให้เขาเอง', icon: 'fa-comment-dots', text: 'ฉันอ่านข้อความของอีกฝ่ายด้วยเสียงโกรธหรือดูถูก ทั้งที่เขาไม่ได้พิมพ์คำนั้น' },
    { id: 'no-rewrite', tag: 'The Unread Aloud', label: 'ไม่เขียนใหม่', icon: 'fa-comment-slash', text: 'หลังพิมพ์ประโยคที่แรง ฉันส่งทันทีโดยไม่เขียนใหม่ให้เป็นคำที่พูดต่อหน้าได้' }
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
      emoji: '💬',
      zoneName: 'ระดับดี',
      titleTh: 'ผู้ที่พิมพ์ใกล้คำพูด',
      titleEn: 'The Table Voice',
      description: 'คำที่คุณพิมพ์ยังใกล้คำที่คุณจะพูดถ้าอีกฝ่ายนั่งอยู่ตรงหน้า คนที่ได้รับข้อความจึงได้ยินเสียงที่ใกล้กับตัวคุณที่โต๊ะ',
      advice: 'รักษาเสียงที่ใกล้กับที่โต๊ะแบบนี้ไว้ โดยเฉพาะตอนโกรธหรือกำลังจะตอบสวน หนึ่งประโยคที่พูดต่อหน้าได้ เปลี่ยนสิ่งที่อีกฝ่ายได้รับ'
    },
    yellow: {
      key: 'yellow',
      min: 11,
      max: 18,
      emoji: '⚡',
      zoneName: 'ระดับปานกลาง',
      titleTh: 'ผู้ที่พิมพ์คมกว่าปกติ',
      titleEn: 'The Sharper Line',
      description: 'คุณพอรู้ว่าควรพูดเหมือนตอนอยู่ต่อหน้า แต่บางครั้งประโยคในแชทยังคมกว่า เพราะไม่มีสีหน้า และคำตอบยังไม่มา',
      advice: 'ครั้งต่อไปก่อนส่งประโยคที่คม ให้นึกหน้าคนนั้น แล้วอ่านประโยคเหมือนกำลังพูดกับเขา ถ้าพูดที่โต๊ะไม่ได้ ให้เขียนใหม่ก่อนกดส่ง'
    },
    red: {
      key: 'red',
      min: 19,
      max: 25,
      emoji: '🔥',
      zoneName: 'ระดับต้องปรับปรุง',
      titleTh: 'ผู้ที่พูดในแชทแรงกว่าต่อหน้า',
      titleEn: 'The Unseen Tone',
      description: 'คุณมีแนวโน้มพิมพ์แรงกว่าคำที่พูดต่อหน้า การไม่มีสีหน้าและจังหวะที่ส่งแล้วถอยออกมา ทำให้ประโยคคมขึ้นก่อนที่อีกฝ่ายจะได้ตอบ',
      advice: 'เลือกหนึ่งแชทที่คุณพิมพ์แรงบ่อย แล้วตั้งกฎกับตัวเองว่าจะนึกหน้าคนนั้นก่อนส่งทุกครั้ง อย่าออกจากแชททันทีหลังส่งประโยคที่แรง ถ้าอ่านออกเสียงแล้วพูดที่โต๊ะไม่ได้ ให้ยังไม่ส่ง'
    }
  },

  articleLink: { href: 'article-online-disinhibition.html#across-the-table', label: 'อ่านวิธีพิมพ์ให้ใกล้คำที่พูดต่อหน้า' },
  support: false
});
