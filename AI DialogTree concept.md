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


