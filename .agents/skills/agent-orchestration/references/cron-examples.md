# Cron Expression Examples

## Basic Patterns

| Expression | Description | Frequency |
|------------|-------------|-----------|
| `*/15 * * * *` | Every 15 minutes | 96x/day |
| `0 * * * *` | Every hour | 24x/day |
| `0 */6 * * *` | Every 6 hours | 4x/day |
| `0 9 * * *` | Every day at 9 AM | 1x/day |
| `0 0 * * *` | Every midnight | 1x/day |
| `0 9 * * 1-5` | Weekdays at 9 AM | 5x/week |
| `0 0 * * 0` | Every Sunday midnight | 1x/week |
| `0 0 1 * *` | First of every month | 1x/month |

## Advanced Patterns

| Expression | Description |
|------------|-------------|
| `0 9,17 * * *` | 9 AM and 5 PM daily |
| `0 9-17 * * 1-5` | Every hour 9-5 on weekdays |
| `*/5 9-17 * * 1-5` | Every 5 minutes during business hours |
| `0 0 1,15 * *` | 1st and 15th of every month |

## Field Reference

```
# Cron format: minute hour day month weekday
#            (0-59) (0-23) (1-31) (1-12) (0-6, 0=Sunday)

* * * * *
│ │ │ │ │
│ │ │ │ └── Weekday (0-6)
│ │ │ └──── Month (1-12)
│ │ └────── Day (1-31)
│ └──────── Hour (0-23)
└────────── Minute (0-59)
```

## Special Characters

| Char | Meaning | Example |
|------|---------|---------|
| `*` | Any value | `* * * * *` = every minute |
| `,` | List | `0,30 * * * *` = :00 and :30 |
| `-` | Range | `9-17 * * * *` = 9 AM to 5 PM |
| `/` | Step | `*/15 * * * *` = every 15 min |

## Use Cases for pi-agent-orchestrator

```typescript
// Daily codebase health check
scheduler.schedule({
  agentType: "Explore",
  description: "Daily health check",
  cron: "0 9 * * *",  // 9 AM every day
});

// Hourly monitoring during work hours
scheduler.schedule({
  agentType: "Monitor",
  description: "Work hours monitoring",
  cron: "0 9-17 * * 1-5",  // Every hour 9-5 weekdays
});

// Weekly report generation
scheduler.schedule({
  agentType: "Analysis",
  description: "Weekly metrics report",
  cron: "0 9 * * 1",  // Monday 9 AM
});

// Quick check every 15 minutes
scheduler.schedule({
  agentType: "Explore",
  description: "Frequent status check",
  cron: "*/15 * * * *",
});
```

## Testing Cron Expressions

```bash
# Use cron-parser or similar to validate
node -e "
const parser = require('cron-parser');
const interval = parser.parseExpression('0 9 * * *');
console.log('Next runs:');
for (let i = 0; i < 5; i++) {
  console.log(interval.next().toISOString());
}
"
```
