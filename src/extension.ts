// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

class AFibIDDeclaration {
	range: vscode.Range;
	id: string;
	value: string;
	isString: boolean;
	declClass: string;

	constructor(range: vscode.Range, id: string, value: string, isString: boolean, declClass: string) {
		this.range = range;
		this.id = id;
		this.value = value;
		this.isString = isString;
		this.declClass = declClass;
	}

	isInSync(): boolean {
		return this.id === this.value;
	}


}

function isValidStaticIdentifierCharacter(ch: string): boolean {
  return /^[A-Z0-9\\.]+$/i.test(ch);
}

function createIdUriFromSourcePath(packagePrefix: string, sourcePath: string): vscode.Uri {
	var reLib = /\/lib\/.*/;
	var idFilePath = `/lib/${packagePrefix}_id.dart`;
	var idFilePath = sourcePath.replace(reLib, idFilePath);
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
	if(startPos === endPos) {
		return null;
	}

	var result = line.substr(startPos, (endPos-startPos+1));
	if(result.endsWith(")") || result.endsWith(",")) {
		result = result.substr(0, result.length-1);
	}
	
	var firstIdxOfDot = result.indexOf(".");
	var secondIdxOfDot = result.indexOf(".", firstIdxOfDot+1);
	if(secondIdxOfDot > 0) {
		result = result.substring(0, secondIdxOfDot);
	}

	return result;
}

function inferPackagePrefixFor(classIdentifier: string): string {
	var firstLower = 0;
	while(firstLower < classIdentifier.length) {
		var currentChar = classIdentifier[firstLower];
		if(currentChar.toLowerCase() === currentChar) {
			break;
		}
		firstLower++;
	}

	var prefix = classIdentifier.substring(0, firstLower-1);
	var lower = prefix.toLowerCase();
	return lower;	
}

function inferClassRootFor(packagePrefix: string, classIdentifier: string): string | null {
	return classIdentifier.substring(packagePrefix.length);
}

function inferIsStringValue(document: vscode.TextDocument, startClassLineNumber: number): boolean {
	var line = document.lineAt(startClassLineNumber);
	const reExtends = RegExp(`\\s+extends\\s+`);
	return !reExtends.test(line.text);
}

function findStartOfIdClass(document: vscode.TextDocument, classIdentifier: string): number {
	var regexText = `class\\s+${classIdentifier}`;
	var re = new RegExp(regexText);
	for(var lineNumber = 0; lineNumber < document.lineCount-1; lineNumber++) {
		var line = document.lineAt(lineNumber);
		var lineText = line.text;
		if(lineText.match(re)) {
			return lineNumber;
		}
	}
	return -1;
}

function findInsertLineForIdClass(document: vscode.TextDocument, lineNumberStartOfClass: number): number {
	// go through each line, matching 
	var lineNumber = lineNumberStartOfClass;
	while(lineNumber < document.lineCount-1) {
		var line = document.lineAt(lineNumber);
		var lineText = line.text;
		if(lineText.indexOf("{") >= 0) {
			return lineNumber+1;
		}
		lineNumber++;
	}
	return -1;
}

function camelToSnakeCase(str: string): string {
	return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function createAfibOutputChanel(): vscode.OutputChannel {
	// This seems to create a new channel each time.   I wish there was a way to re-use an existing
	// channel, but it looks like that is not possible yet: 
	// https://github.com/microsoft/vscode/issues/65108
	let output = vscode.window.createOutputChannel("afib");
	
	output.show();
	return output;
}

function validateIsIdDocument(document: vscode.TextDocument): boolean {
	var lineNumber = 0;
	var regexStartClass = RegExp('class\\s+.*ID\\s+extends\\s+.*ID');
	var lineCount = document.lineCount;
	while(lineNumber < lineCount) {
		var line = document.lineAt(lineNumber++);
		var lineText = line.text;
		if(regexStartClass.test(lineText)) {
			return true;
		}
	}
	return false;
}

function parseIdDeclaration(lineNumber: number, line: string): AFibIDDeclaration | null {

	if(lineNumber === 10) {
		let breakHere = 0;
		breakHere++;
	}

	var reMatchClassDecl = RegExp(/static\s+const\s+(.*?)\s+=\s+(.*?)\([\"\'](.*?)[\"\']\);/);
	var isString = false;
	let result = line.match(reMatchClassDecl);
	if(result === null) {
		var reMatchStringDecl = RegExp(/static\s+const\s+(.*?)\s+(=)\s+["'](.*?)["'];/);
		result = line.match(reMatchStringDecl);
		if(result === null) {
			return null;
		}		
		isString = true;
	}

	let fullMatch = result[0];
	let id = result[1];
	let declClass = result[2];
	let value = result[3];
	let startOf = line.indexOf(fullMatch);
	let endOf = startOf + fullMatch.length;
	let range = new vscode.Range(new vscode.Position(lineNumber, startOf), new vscode.Position(lineNumber, endOf));
	return new AFibIDDeclaration(
		range, id, value, isString, declClass
	);
}

function createIdDeclaration(id: string, isString: boolean, declClass: string): string {
	var result = "";
	if(isString) {
		result = `static const ${id} = "${id}";`;				
	} else {
		result = `static const ${id} = ${declClass}("${id}");`;
	}
	return result;
}

function createIdSyncEdit(document: vscode.TextDocument, lineNumber: number, output: vscode.OutputChannel): vscode.TextEdit | null {

	// first, see if this is a declaration line.
	const decl = parseIdDeclaration(lineNumber, document.lineAt(lineNumber).text);
	if(decl === null) {
		return null;
	}
	
	if(decl.isInSync()) {
		return null;
	}


	let revised = createIdDeclaration(decl.id, decl.isString, decl.declClass);
	output.appendLine(`Synchronizing line ${lineNumber}: ${decl.id}`);
	
	return vscode.TextEdit.replace(decl.range, revised);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Your extension "afib-project-helper" is now active!');

	let disposableSync = vscode.commands.registerCommand('afib-project-helper.sync-identifiers', () => {

		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("Afib: You must run this command with an AFib id file open.");
			return;
		}

		const document = editor.document;
		const output = createAfibOutputChanel();
		output.appendLine(`Syncronizing ${document.uri}`);

		if(!validateIsIdDocument(document)) {
			vscode.window.showErrorMessage("Afib: Could not find AFib-style id declarations in this file.");
			return;			
		}

		const textEdits: vscode.TextEdit[] = [];
		output.appendLine("Starting sync");

		// now, go through each line in the document, and replace the line 
		for(var i = 0; i < document.lineCount; i++) {
			const edit = createIdSyncEdit(document, i, output);
			if(edit !== null) {
				textEdits.push(edit);
			}
		}

		if(textEdits.length === 0) {
			output.appendLine("No changes were necessary.");
			return;
		}

		output.appendLine(`Applying ${textEdits.length} changes.`);
		const workEdits = new vscode.WorkspaceEdit();		
		workEdits.set(document.uri, textEdits); // give the edits
		vscode.workspace.applyEdit(workEdits); 		

	});

	let disposableAdd = vscode.commands.registerCommand('afib-project-helper.add-identifier', () => {

		const editor = vscode.window.activeTextEditor;

		if (!editor) {
			vscode.window.showErrorMessage("Afib: You must run this command from within an active editor.");
			return;
		}
		const document = editor.document;
		const selection = editor.selection;
		const activeLine = selection.active.line;
		const selectedLine = document.lineAt(activeLine).text;
		if(selectedLine.length <= 0) {
			vscode.window.showErrorMessage("Afib: You must place the cursor within a static ID reference (e.g. XXWidgetID.myWidgetId)");
			return;
		}

		console.log(`Got the selected text ${selectedLine}`);
		const staticIdentifier = extractIdentifierFromLine(selectedLine, selection.active.character);
		const notStaticIdentifierError = "AFib: The cursor must be within a static reference to an AFib identifer, like 'WidgetID.myNewWidget'";
		if(staticIdentifier === null || staticIdentifier.indexOf(".") < 0) {
			vscode.window.showErrorMessage(notStaticIdentifierError);
			return;
		}

		// split the full identifer into the class and the idenfifer
		console.log(`Got the selected identifier ${staticIdentifier}`);
		const splitIdentifier = staticIdentifier.split(".");
		if(splitIdentifier.length !== 2) {
			vscode.window.showErrorMessage(notStaticIdentifierError);
			return;
		}
		const classIdentifier = splitIdentifier[0];
		const nameIdentifier = splitIdentifier[1];
		const camelIdentifier = nameIdentifier;
		const afibPackagePrefix = inferPackagePrefixFor(classIdentifier);
		if(afibPackagePrefix === null || afibPackagePrefix.length === 0) {
			vscode.window.showErrorMessage(`AFib: Could not infer the package prefix from class ${classIdentifier}`);
		}

		const afibClassRoot = inferClassRootFor(afibPackagePrefix, classIdentifier);
		if(afibClassRoot === null) {
			vscode.window.showErrorMessage(`AFib: Could not infer an AFib identifier type from class ${classIdentifier}`);
			return;
		}

		const afibClassEnd = afibClassRoot.length === 0 ? "" : ")";
		const uriIdFile = createIdUriFromSourcePath(afibPackagePrefix, document.fileName);
		
		vscode.workspace.openTextDocument(uriIdFile).then( (idDoc) => {
			console.log(`Opened document ${idDoc.fileName}`);
			const firstLine = findStartOfIdClass(idDoc, classIdentifier);
			if(firstLine < 0) {
				vscode.window.showErrorMessage(`AFib: Could not find the class ${classIdentifier} in file ${uriIdFile}`);
				return;
			}

			const insertLine = findInsertLineForIdClass(idDoc, firstLine);
			if(insertLine < 0) {
				vscode.window.showErrorMessage(`AFib: Could not find an '{' starting on line ${firstLine}`);
				return;
			}

			console.log(`${classIdentifier} starts on line ${firstLine}, will insert on ${insertLine}`);

			const insertPos = new vscode.Position(insertLine, 0);
			const isStringValue = inferIsStringValue(idDoc, firstLine);
			const idDecl = createIdDeclaration(nameIdentifier, isStringValue, `${afibPackagePrefix.toUpperCase()}${afibClassRoot}`);
			var insertText = `  ${idDecl}\n`;
			const textEdits: vscode.TextEdit[] = [];
			textEdits.push(vscode.TextEdit.insert(
				insertPos,
				insertText
			));

			const workEdits = new vscode.WorkspaceEdit();
			
			workEdits.set(uriIdFile, textEdits); // give the edits
			vscode.workspace.applyEdit(workEdits); 		

			vscode.env.clipboard.writeText(staticIdentifier);

			const output = createAfibOutputChanel();
			output.appendLine(`Afib: Created identifier ${staticIdentifier} in ${afibPackagePrefix}_id.dart`);
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

	context.subscriptions.push(disposableAdd);
	context.subscriptions.push(disposableSync);
}

// this method is called when your extension is deactivated
export function deactivate() {}
