import { describe, it, expect } from 'vitest'
import { htmlToText, REMINDER_EMAIL_HEADERS, SUPPORT_EMAIL } from './email.ts'

describe('htmlToText', () => {
  it('extracts visible text and drops tags', () => {
    const out = htmlToText('<p>Hello <strong>world</strong></p>')
    expect(out).toBe('Hello world')
  })

  it('renders http links as "label (url)"', () => {
    const out = htmlToText('<a href="https://matrixportal.io/profile">View profile</a>')
    expect(out).toBe('View profile (https://matrixportal.io/profile)')
  })

  it('keeps only the label for mailto links', () => {
    const out = htmlToText('<a href="mailto:help@x.com">help@x.com</a>')
    expect(out).toBe('help@x.com')
  })

  it('removes head, style and svg regions', () => {
    const html = `<head><title>x</title></head><style>.a{color:red}</style>` +
      `<svg width="10"><path d="M0 0" /></svg><p>Body text</p>`
    const out = htmlToText(html)
    expect(out).toBe('Body text')
    expect(out).not.toMatch(/svg|path|color:red|<title>/i)
  })

  it('separates block-level elements with line breaks', () => {
    const out = htmlToText('<h1>Title</h1><p>One</p><p>Two</p>')
    expect(out).toBe('Title\n\nOne\n\nTwo')
  })

  it('decodes common HTML entities', () => {
    expect(htmlToText('<p>A &amp; B &lt;ok&gt; &copy;</p>')).toBe('A & B <ok> (c)')
  })

  it('collapses runs of 3+ newlines down to a single blank line', () => {
    const out = htmlToText('<p>A</p>\n\n\n\n<p>B</p>')
    expect(out).toBe('A\n\nB')
  })

  it('returns empty string for non-string input', () => {
    // @ts-expect-error testing defensive runtime guard
    expect(htmlToText(null)).toBe('')
  })
})

describe('REMINDER_EMAIL_HEADERS', () => {
  it('provides a mailto List-Unsubscribe to the support mailbox', () => {
    expect(REMINDER_EMAIL_HEADERS['List-Unsubscribe']).toBe(`<mailto:${SUPPORT_EMAIL}?subject=unsubscribe>`)
  })

  it('does not advertise a one-click POST endpoint we do not have', () => {
    expect(REMINDER_EMAIL_HEADERS['List-Unsubscribe-Post']).toBeUndefined()
  })
})
