import { estimateTokens } from '../dist/utils/estimate.js'

const sampleText = 'This is a test '.repeat(1000)

export async function run () {
  const result = estimateTokens(sampleText)
  console.log(`Estimated ${result} tokens`)
}

run()
