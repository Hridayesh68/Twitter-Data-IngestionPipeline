# Analysis 07: Dataset KPIs & Multi-Faceted Summary

## Overview
Executes a high-efficiency single `$facet` aggregation pipeline combining dataset-level key performance indicators, language distributions, and top high-impact tweet texts.

## High-Level Dataset KPIs
| KPI Metric | Value |
| :--- | :---: |
| **Total Ingested Tweets** | **966** |
| **Unique Authors** | **128** |
| **Cumulative Retweets** | **99,879** |
| **Cumulative Favorites** | **65,359** |
| **Average Retweets / Tweet** | **103.39** |
| **Average Likes / Tweet** | **67.66** |
| **Average Hashtags / Tweet** | **0.76** |

## Language Distribution
| Language Code | Tweet Volume |
| :---: | :---: |
| `en` | 702 |
| `tr` | 166 |
| `es` | 21 |
| `fr` | 19 |
| `und` | 10 |
| `in` | 9 |
| `pt` | 7 |
| `ht` | 6 |
| `ro` | 4 |
| `ja` | 3 |

## High-Impact Sample Tweets

### 1. By @zeldman (9132 RTs, 0 Likes)
> RT @alex_macdonald: I will fight to support the Oxford comma until I draw my last breath. http://t.co/Y0T6c3F4iI


### 2. By @zeldman (4061 RTs, 0 Likes)
> RT @EliLanger: There are 2 kinds of people in this world. http://t.co/y8bUyrGHeo


### 3. By @ChelseaFC (3804 RTs, 1099 Likes)
> FULL-TIME: Arsenal 0-0 @ChelseaFC. #CFCLive #AFCvCFC http://t.co/5kN8Qo5xBj


### 4. By @cnnbrk (3134 RTs, 1721 Likes)
> Meet Marilyn Mosby, the state's attorney who called Freddie Gray's death a homicide: http://t.co/CNyQhBzgDW http://t.co/0LLLCHiMyy


### 5. By @ChelseaFC (2610 RTs, 1105 Likes)
> Mourinho on Arsenal fans' chants: 'Boring is 10 years without winning a Premier League title. That is boring.' #CFC


### 6. By @cnnbrk (2146 RTs, 840 Likes)
> The overall death toll in the #NepalQuake has jumped to more than 2,500. http://t.co/ZJjcURh7Lu http://t.co/1ywnjhjlwC


### 7. By @premierleague (2069 RTs, 589 Likes)
> FULL-TIME Arsenal 0-0 Chelsea. The Blues need a maximum of 6 points in their final 5 matches to win a 4th #BPL title http://t.co/rBcCMtyLXM


### 8. By @FCBarcelona (1810 RTs, 1011 Likes)
> FULL TIME: There's the final whistle! #Messi &amp; Neymar win it for 10-man Bar├ºa! ESP 0 - 2 FCB #FCBLive #EspanyolFCB http://t.co/vlowggf4Kf


## Conclusion
The multi-faceted pipeline demonstrates high computational efficiency by computing distinct metric facets across the entire dataset within a single database pass.
