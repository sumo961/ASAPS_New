AI DialogTree
	Topic
	Role of NPC
	Exit Conditions
	Exit targets
	Max duration

TextInput analysis for AI
	Topic
	Emotions
	ConditionMatching

counters central definition?

	make the slected beat highlight more visible, more like in the path analysis, e.g. highlight the whole beat 

allow value inputs by interactors using inputText

Shared assets for clusters

	Update debug logic and marked display of beats for clusters

	Fix auto arrange for stories with clusters

font sizes in settings vs. textboxes discrepancy

	Title and author need to be bigger according to settings

	font in visual editor should match setting, but shows Ariel

	setting visual editor to go back to general settings

	button sounds need to be mapped

transitions are missing

Theme system

	expose all changes to AI

Expose playtrace to AI

	have movmentChoice beats with elements marked already visited once visited

Let's consider theme support. The idea here is to enable themes that
  combine fonts, textbox stylying and graphics. themes should be transferable
  between different projects. Example themes could be as simple as mimiking
  twine or more complex like typical visual novels or early point and click
  adventure games 

	Path analysis needs to be revisited

	autodistribute on flowchart needs to be revisited

Make a plan for standalone playback engines for web, ios, android, MacOs, and windows. Consider how assets need to be handled and what extra functions are needed (game state save function with several slots and restart). also consider notarization requirements for distribution. I guess electron is the way to go, but consider other options. Also plan for a standalone desktop version of the full authoing tool for mac and windows and how to best deploy in a website on the public internet (what needs to be installed, how to secure, how to implement a multiuser-system with individual and group logins) use thinking and take your time. 

- import themes
- import projects from twine or renpy
- more space for inspector - maybe make modal?
- visual editor for dialogTree phases
- duplicate beats 
- duplicate graophics
- allow value inputs by interactors using inputText
- Shared assets for clusters
	- counters central definition?


Let's consider some UX changes and improvements -

Editor improvements

  1) right now the inspector is quite cramped (see image), especially when it comes to
  dialogTrees where text overflows. I understand the overflow issue can be
  solved, but the question is whether the inspector should become a floating
  modal instead? Make some arguments for and against this change. In any
  case, allow multiline display of dialog content to fix the overflow issue.

  2) the visual editor for the dialotree needs to be overhauled to it
  facilitates editing the different phases in the conversation. consider how
  to best do that, e.g. hilighting the current speaker

Counters and Variables improvements

  3) Counters defined with characters should automatically be available in a
  dropdown whereever counters can be changed, but it should still be possible
  to add new ones. Similarly, allow the definition of variables in the global setting and make them available everywhere variables can be used in the same way counters are
  describe in the previous point.

  4) make sure, inputText can also change calues for existing counters and
  variables. In therory this should already work, but there could be type
  issues (string vs. number) 

Efficiency updates

  5) there needs to be a function to duplicate beats with all content intact
  and settings intact and another one to copy visual content other than text
  boxes and buttons. maybe this can be done with a context menu

  6) enable shared visual content for clusters - backgrounds, props and
  characters would be automatically available for all beats in the cluster,
  but can still be changed per beat


───────────────────────────────


- No text animations for visual editor
- option to turn off text animations in preivew
- allow starting preview at a certain beat - have a menu with all beats in preview
- optional level meters for counters, setting to turn on/off, as well as color and orientation in character counters tab
- chat-like option for dialogTree
- search and replace 

