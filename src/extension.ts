// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

function isValidStaticIdentifierCharacter(ch: string): boolean {
  return /^[A-Z0-9\\.]+$/i.test(ch);
}

function createIdUriFromSourcePath(sourcePath: string): vscode.Uri {
	var reLib = /\/lib\/.*/;
	var idFilePath = sourcePath.replace(reLib, "/lib/id.dart");
	console.log(`id file path is ${idFilePath}`);
	var uriIdFile = vscode.Uri.file(idFilePath);
	return uriIdFile;
}

function extractIdentifierFromLine(line: String, originPos: number): string | null {
	var startPos = originPos;
	while(startPos > 0 && isValidStaticIdentifierCharacter(line[startPos-1])) {
		startPos--;
	}
	var endPos = originPos;
	while(endPos < (line.length-1) && isValidStaticIdentifierCharacter(line[endPos+1])) {
		endPos++;
	}
	if(startPos == endPos) {
		return null;
	}

	var result = line.substr(startPos, (endPos-startPos+1));
	if(result.endsWith(")") || result.endsWith(",")) {
		result = result.substr(0, result.length-1);
	}
	return result;
}

function inferPackagePrefixFor(classIdentifier: string, classRoot: string): string | null {
	const idx = classIdentifier.indexOf(classRoot);
	return classIdentifier.substr(0, idx);
}

function inferClassRootFor(classIdentifier: string): string | null {
	if(classIdentifier.indexOf("WidgetID") > 0) {
		return "WidgetID";
	} else if(classIdentifier.indexOf("ScreenID") > 0) {
		return "ScreenID";
	} else if(classIdentifier.indexOf("StateTestID") > 0) {
		return "StateTestID";
	} else if(classIdentifier.indexOf("ScreenTestID") > 0) {
		return "SingleScreenTestID";
	} else if(classIdentifier.indexOf("WorkflowTestID") > 0) {
		return "AFWorkflowTestID";
	} else if(classIdentifier.indexOf("TestDataID") > 0) {
		return "";
	} else if(classIdentifier.indexOf("ReusableTestID") > 0) {
		return "ReusableTestID";
	} else if(classIdentifier.indexOf("LibraryID") > 0) {
		return "LibraryID";
	} else if(classIdentifier.indexOf("ThemeID") > 0) {
		return "ThemeID";
	} else if(classIdentifier.indexOf("TranslationID") > 0) {
		return "TranslationID";
	}
	return null;
}

function findFirstLineOfIdClass(document: vscode.TextDocument, classIdentifier: string): number {
	// go through each line, matching 
	var regexText = `class\\s+${classIdentifier}`;
	var re = new RegExp(regexText);
	for(var lineNumber = 0; lineNumber < document.lineCount-1; lineNumber++) {
		var line = document.lineAt(lineNumber);
		var lineText = line.text;
		if(lineText.match(re)) {
			if(lineText.indexOf("{") < 0) {
				return lineNumber+2;
			}
			return lineNumber+1;
		}
	}
	return -1;
}

function camelToSnakeCase(str: string): string {
	return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "afib-project-helper" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('afib-project-helper.add-identifier', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		const editor = vscode.window.activeTextEditor;

		if (!editor) {
			console.log("No active editor!");
			return;
		}
		const document = editor.document;
		const selection = editor.selection;
		const activeLine = selection.active.line;
		const selectedLine = document.lineAt(activeLine).text;
		if(selectedLine.length <= 0) {
			console.log("No active selection!");
			return;
		}

		console.log(`Got the selected text ${selectedLine}`);
		const staticIdentifier = extractIdentifierFromLine(selectedLine, selection.active.character);
		const notStaticIdentifierError = "AFib: The cursor must be within a static reference to an AFib identifer, like 'WidgetID.myNewWidget'";
		if(staticIdentifier == null || staticIdentifier.indexOf(".") < 0) {
			vscode.window.showErrorMessage(notStaticIdentifierError);
			return;
		}

		// split the full identifer into the class and the idenfifer
		console.log(`Got the selected identifier ${staticIdentifier}`);
		const splitIdentifier = staticIdentifier.split(".");
		if(splitIdentifier.length != 2) {
			vscode.window.showErrorMessage(notStaticIdentifierError);
			return;
		}
		const classIdentifier = splitIdentifier[0];
		const nameIdentifier = splitIdentifier[1];
		const snakeIdentifier = camelToSnakeCase(nameIdentifier)
		const afibClassRoot = inferClassRootFor(classIdentifier);
		if(afibClassRoot == null) {
			vscode.window.showErrorMessage(`AFib: Could not infer an AFib identifier type from class ${classIdentifier}`);
			return;
		}
		const afibPackagePrefix = inferPackagePrefixFor(classIdentifier, afibClassRoot);

		const afibClassEnd = afibClassRoot.length == 0 ? "" : ")";
		const uriIdFile = createIdUriFromSourcePath(document.fileName);

		
		vscode.workspace.openTextDocument(uriIdFile).then( (idDoc) => {
			console.log(`Opened document ${idDoc.fileName}`);
			const firstLine = findFirstLineOfIdClass(idDoc, classIdentifier);
			if(firstLine < 0) {
				vscode.window.showErrorMessage(`AFib: Could not find the class ${classIdentifier} in file ${uriIdFile}`);
				return;
			}

			console.log(`${classIdentifier} starts on line ${firstLine}`);
			const insertPos = new vscode.Position(firstLine, 0);
			const insertText = `  static const ${nameIdentifier} = AF${afibClassRoot}("${snakeIdentifier}", ${afibPackagePrefix}LibraryID.id${afibClassEnd};\n`;

			const textEdits: vscode.TextEdit[] = [];
			textEdits.push(vscode.TextEdit.insert(
				insertPos,
				insertText
			));

			const workEdits = new vscode.WorkspaceEdit();
			
			workEdits.set(uriIdFile, textEdits); // give the edits
			vscode.workspace.applyEdit(workEdits); 		

			vscode.env.clipboard.writeText(staticIdentifier);
	
			/*
			vscode.window.showTextDocument(idDoc, 1, true).then(shownDoc => {
				shownDoc.edit(edit => {
					edit.insert(insertPos, insertText);
					vscode.window.showInformationMessage(`AFib: Successfully created ${classIdentifier}.${nameIdentifier}`);
				});
			});
			*/
		});
	



		
		/*
 		const textEdits: vscode.TextEdit[] = [];
		textEdits.push(vscode.TextEdit.insert(
			new vscode.Position(0,0),
			`// Inserted text by afib: ${selectedText}`
		));
		
		

		const workEdits = new vscode.WorkspaceEdit();
		workEdits.set(uriIdFile, textEdits); // give the edits
		vscode.workspace.applyEdit(workEdits); 		
		
		vscode.window.showInformationMessage('Added ID for AFib');
		*/

	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
