// Initialize Dexie database
const db = new Dexie('TabManagerDatabase');
db.version(1).stores({
  sessions: '++id,name,date,tabs,groups'
});

document.addEventListener('DOMContentLoaded', () => {
  const saveTabsButton = document.getElementById('saveTabsButton');
  const viewTabsButton = document.getElementById('viewTabsButton');
  const viewGroupsButton = document.getElementById('viewGroupsButton'); // New button
  const tabsContainer = document.getElementById('tabsContainer');
  const tabsList = document.getElementById('tabsList');
  const savedGroupsContainer = document.getElementById('savedGroupsContainer'); // New container
  const savedGroupsList = document.getElementById('savedGroupsList'); // New list

  // Event listener for "Save and Close Tabs" button
  saveTabsButton.addEventListener('click', () => {
    // Show the confirmation modal
    const confirmationModal = document.getElementById('confirmationModal');
    confirmationModal.style.display = 'flex';

    // Handle modal buttons
    const modalYesButton = document.getElementById('modalYesButton');
    const modalNoButton = document.getElementById('modalNoButton');

    const onYes = async () => {
      confirmationModal.style.display = 'none';
      // Proceed to save and close tabs
      try {
        // Query all tabs in the current window
        const tabs = await chrome.tabs.query({ currentWindow: true });

        if (tabs.length === 0) {
          alert('No tabs to save.');
          return;
        }

        // Get unique group IDs
        const groupIds = [...new Set(tabs.map(tab => tab.groupId).filter(id => id !== -1))];

        // Get group details
        const groups = {};
        for (const groupId of groupIds) {
          const group = await chrome.tabGroups.get(groupId);
          groups[groupId] = {
            id: groupId,
            title: group.title || 'Unnamed Group',
            color: group.color,
          };
        }

        // Map tabs with group information
        const tabsData = tabs.map(tab => ({
          title: tab.title,
          url: tab.url,
          groupId: tab.groupId,
          pinned: tab.pinned,
        }));

        const currentDateTime = new Date();
        const sessionName = `Group from ${currentDateTime.toLocaleDateString()} at ${currentDateTime.toLocaleTimeString()}`;

        // Add the new session to the database
        await db.sessions.add({
          name: sessionName,
          date: currentDateTime.toISOString(),
          tabs: tabsData,
          groups: groups, // Store group details
        });

        const tabIds = tabs.map(tab => tab.id);
        // Close all tabs
        await chrome.tabs.remove(tabIds);

        alert('Tabs and groups saved and closed successfully.');
      } catch (error) {
        console.error('Error saving tabs and groups:', error);
      }

      // Remove event listeners to prevent duplicates
      modalYesButton.removeEventListener('click', onYes);
      modalNoButton.removeEventListener('click', onNo);
    };

    const onNo = () => {
      // Close the modal
      confirmationModal.style.display = 'none';
      // Remove event listeners to prevent duplicates
      modalYesButton.removeEventListener('click', onYes);
      modalNoButton.removeEventListener('click', onNo);
    };

    modalYesButton.addEventListener('click', onYes);
    modalNoButton.addEventListener('click', onNo);
  });


  // Event listener for "View Your Tabs/Groups" button
  viewTabsButton.addEventListener('click', () => {
    // Hide other containers if they're visible
    if (savedGroupsContainer.style.display === 'block') {
      savedGroupsContainer.style.display = 'none';
      viewGroupsButton.textContent = 'View Groups';
    }

    // Toggle the visibility of the tabs container
    if (tabsContainer.style.display === 'none' || tabsContainer.style.display === '') {
      loadSavedSessions();
      tabsContainer.style.display = 'block';
      viewTabsButton.textContent = 'Hide Your Tabs/Groups';
    } else {
      tabsContainer.style.display = 'none';
      viewTabsButton.textContent = 'View Your Tabs/Groups';
    }
  });

  // Event listener for "View Groups" button
  viewGroupsButton.addEventListener('click', () => {
    // Hide other containers if they're visible
    if (tabsContainer.style.display === 'block') {
      tabsContainer.style.display = 'none';
      viewTabsButton.textContent = 'View Your Tabs/Groups';
    }

    // Toggle the visibility of the saved groups container
    if (savedGroupsContainer.style.display === 'none' || savedGroupsContainer.style.display === '') {
      loadSavedGroups();
      savedGroupsContainer.style.display = 'block';
      viewGroupsButton.textContent = 'Hide Groups';
    } else {
      savedGroupsContainer.style.display = 'none';
      viewGroupsButton.textContent = 'View Groups';
    }
  });

  // Function to load saved sessions from the database and display them
  async function loadSavedSessions() {
    try {
      const sessions = await db.sessions.toArray();
      tabsList.innerHTML = '';

      if (sessions.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No saved sessions.';
        tabsList.appendChild(li);
        return;
      }

      // Sort sessions by date (newest first)
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));

      sessions.forEach((session) => {
        const li = document.createElement('li');
        li.className = 'session-item';

        // Session header
        const header = document.createElement('div');
        header.className = 'session-header';

        const sessionName = document.createElement('span');
        sessionName.textContent = `${session.name}`;
        sessionName.className = 'session-name';
        sessionName.addEventListener('click', () => {
          toggleSessionDetails(li);
        });

        // Create the Edit button
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.className = 'small-button';
        editButton.addEventListener('click', async (event) => {
          event.stopPropagation(); // Prevent triggering the sessionName click event
          const newName = prompt('Enter a new name for this session:', session.name);
          if (newName) {
            session.name = newName;
            await db.sessions.put(session);
            loadSavedSessions();
          }
        });

        // Create the Delete button with a trashcan icon
        const deleteButton = document.createElement('button');
        deleteButton.className = 'small-button delete-button';
        deleteButton.innerHTML = '&#128465;'; // Unicode for trashcan icon
        deleteButton.addEventListener('click', async (event) => {
          event.stopPropagation(); // Prevent triggering the sessionName click event
          if (confirm('Are you sure you want to delete this session?')) {
            await db.sessions.delete(session.id);
            loadSavedSessions();
          }
        });

        // Create a container for the buttons
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'session-buttons';

        buttonsContainer.appendChild(editButton);
        buttonsContainer.appendChild(deleteButton);

        header.appendChild(sessionName);
        header.appendChild(buttonsContainer);

        // Session details (tabs list and open button)
        const details = document.createElement('div');
        details.className = 'session-details';
        details.style.display = 'none'; // Hidden by default

        // Group tabs by groupId
        const tabsByGroup = {};
        session.tabs.forEach(tab => {
          const groupId = tab.groupId !== undefined ? tab.groupId : -1;
          if (!tabsByGroup[groupId]) {
            tabsByGroup[groupId] = [];
          }
          tabsByGroup[groupId].push(tab);
        });

        // Create the tabs list
        const tabsUl = document.createElement('ul');
        tabsUl.className = 'tabs-list';

        // Function to create group or tab item
        const createTabItem = (tab, isGroup) => {
          const tabLi = document.createElement('li');
          if (isGroup) {
            tabLi.className = 'group-name';
            tabLi.textContent = tab.title || 'Unnamed Group';
            tabLi.addEventListener('click', () => {
              toggleGroupDetails(tabLi);
            });
          } else {
            const tabLink = document.createElement('a');
            tabLink.href = '#';
            tabLink.textContent = tab.title || tab.url;
            tabLink.title = tab.url;
            tabLink.addEventListener('click', (event) => {
              event.preventDefault();
              chrome.tabs.create({ url: tab.url });
            });
            tabLi.appendChild(tabLink);
          }
          return tabLi;
        };

        // Build the list
        Object.keys(tabsByGroup).forEach(groupId => {
          const groupTabs = tabsByGroup[groupId];
          if (groupId !== '-1' && session.groups && session.groups[groupId]) {
            // It's a group
            const groupInfo = session.groups[groupId];
            const groupLi = createTabItem({ title: groupInfo.title }, true);

            // Create a nested list for group tabs
            const groupTabsUl = document.createElement('ul');
            groupTabsUl.className = 'group-tabs-list';
            groupTabsUl.style.display = 'none'; // Hidden by default

            groupTabs.forEach(tab => {
              const tabLi = createTabItem(tab, false);
              groupTabsUl.appendChild(tabLi);
            });

            groupLi.appendChild(groupTabsUl);
            tabsUl.appendChild(groupLi);
          } else {
            // Not in a group
            groupTabs.forEach(tab => {
              const tabLi = createTabItem(tab, false);
              tabsUl.appendChild(tabLi);
            });
          }
        });

        const openButton = document.createElement('button');
        openButton.textContent = 'Open All Tabs';
        openButton.className = 'open-button';
        openButton.addEventListener('click', () => {
          restoreSession(session);
        });

        details.appendChild(tabsUl);
        details.appendChild(openButton);

        li.appendChild(header);
        li.appendChild(details);
        tabsList.appendChild(li);
      });
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }

  // Function to toggle session details visibility
  function toggleSessionDetails(sessionItem) {
    const details = sessionItem.querySelector('.session-details');
    if (details.style.display === 'none' || details.style.display === '') {
      details.style.display = 'block';
    } else {
      details.style.display = 'none';
    }
  }

  // Function to toggle group details visibility
  function toggleGroupDetails(groupItem) {
    const groupTabsList = groupItem.querySelector('.group-tabs-list');
    if (groupTabsList.style.display === 'none' || groupTabsList.style.display === '') {
      groupTabsList.style.display = 'block';
    } else {
      groupTabsList.style.display = 'none';
    }
  }

  // Function to restore a session
  // Function to restore a session
    async function restoreSession(session) {
        if (session.tabs && session.tabs.length > 0) {
        const groupIdMap = {}; // Map original group IDs to new group IDs
    
        // Create tabs without grouping first
        const createdTabs = [];
        for (const tabData of session.tabs) {
            const createdTab = await chrome.tabs.create({
            url: tabData.url,
            pinned: tabData.pinned || false,
            active: false,
            });
            createdTabs.push({ createdTab, tabData });
        }
    
        // Group tabs if necessary
        for (const { createdTab, tabData } of createdTabs) {
            if (tabData.groupId !== -1 && session.groups && session.groups[tabData.groupId]) {
            const originalGroupId = tabData.groupId;
            let newGroupId = groupIdMap[originalGroupId];
    
            if (!newGroupId) {
                // Create a new group
                newGroupId = await chrome.tabs.group({ tabIds: createdTab.id });
                groupIdMap[originalGroupId] = newGroupId;
    
                // Update group title and color
                const groupInfo = session.groups[originalGroupId];
                await chrome.tabGroups.update(newGroupId, {
                title: groupInfo.title || '',
                color: groupInfo.color || 'grey',
                });
            } else {
                // Add tab to existing group
                await chrome.tabs.group({ groupId: newGroupId, tabIds: createdTab.id });
            }
            }
        }
    
        // Activate the first tab
        await chrome.tabs.update(createdTabs[0].createdTab.id, { active: true });
        } else {
        alert('No tabs to restore in this session.');
        }
    }
    
// Function to load saved sessions from the database and display them
async function loadSavedSessions() {
    try {
      const sessions = await db.sessions.toArray();
      tabsList.innerHTML = '';
  
      if (sessions.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No saved sessions.';
        tabsList.appendChild(li);
        return;
      }
  
      // Sort sessions by date (newest first)
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
  
      sessions.forEach((session) => {
        const li = document.createElement('li');
        li.className = 'session-item';
  
        // Session header
        const header = document.createElement('div');
        header.className = 'session-header';
  
        const sessionName = document.createElement('span');
        sessionName.textContent = `${session.name}`;
        sessionName.className = 'session-name';
        sessionName.addEventListener('click', () => {
          toggleSessionDetails(li);
        });
  
        // Create the Edit button
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.className = 'small-button';
        editButton.addEventListener('click', async (event) => {
          event.stopPropagation(); // Prevent triggering the sessionName click event
          const newName = prompt('Enter a new name for this session:', session.name);
          if (newName) {
            session.name = newName;
            await db.sessions.put(session);
            loadSavedSessions();
          }
        });
  
        // Create the Delete button with a trashcan icon
        const deleteButton = document.createElement('button');
        deleteButton.className = 'small-button delete-button';
        deleteButton.innerHTML = '&#128465;'; // Unicode for trashcan icon
        deleteButton.addEventListener('click', async (event) => {
          event.stopPropagation(); // Prevent triggering the sessionName click event
          if (confirm('Are you sure you want to delete this session?')) {
            await db.sessions.delete(session.id);
            loadSavedSessions();
          }
        });
  
        // Create a container for the buttons
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'session-buttons';
  
        buttonsContainer.appendChild(editButton);
        buttonsContainer.appendChild(deleteButton);
  
        header.appendChild(sessionName);
        header.appendChild(buttonsContainer);
  
        // Session details (tabs list and open button)
        const details = document.createElement('div');
        details.className = 'session-details';
        details.style.display = 'none'; // Hidden by default
  
        // Group tabs by groupId
        const tabsByGroup = {};
        session.tabs.forEach(tab => {
          const groupId = tab.groupId !== undefined ? tab.groupId : -1;
          if (!tabsByGroup[groupId]) {
            tabsByGroup[groupId] = [];
          }
          tabsByGroup[groupId].push(tab);
        });
  
        // Create the tabs list
        const tabsUl = document.createElement('ul');
        tabsUl.className = 'tabs-list';
  
        // Function to create group or tab item
        const createTabItem = (tab, isGroup, groupId) => {
          const tabLi = document.createElement('li');
          if (isGroup) {
            tabLi.className = 'group-item';
  
            // Group name span
            const groupNameSpan = document.createElement('span');
            groupNameSpan.className = 'group-name';
            groupNameSpan.textContent = tab.title || 'Unnamed Group';
            groupNameSpan.addEventListener('click', () => {
              toggleGroupDetails(tabLi);
            });
  
            // Open Group button
            const openGroupButton = document.createElement('button');
            openGroupButton.textContent = 'Open Group';
            openGroupButton.className = 'small-button open-group-button';
            openGroupButton.addEventListener('click', (event) => {
              event.stopPropagation(); // Prevent toggling group details
              restoreGroup(session, groupId);
            });
  
            // Group header container
            const groupHeader = document.createElement('div');
            groupHeader.className = 'group-header';
            groupHeader.appendChild(groupNameSpan);
            groupHeader.appendChild(openGroupButton);
  
            tabLi.appendChild(groupHeader);
          } else {
            const tabLink = document.createElement('a');
            tabLink.href = '#';
            tabLink.textContent = tab.title || tab.url;
            tabLink.title = tab.url;
            tabLink.addEventListener('click', (event) => {
              event.preventDefault();
              chrome.tabs.create({ url: tab.url });
            });
            tabLi.appendChild(tabLink);
          }
          return tabLi;
        };
  
        // Build the list
        Object.keys(tabsByGroup).forEach(groupId => {
          const groupTabs = tabsByGroup[groupId];
          if (groupId !== '-1' && session.groups && session.groups[groupId]) {
            // It's a group
            const groupInfo = session.groups[groupId];
            const groupLi = createTabItem({ title: groupInfo.title }, true, groupId);
  
            // Create a nested list for group tabs
            const groupTabsUl = document.createElement('ul');
            groupTabsUl.className = 'group-tabs-list';
            groupTabsUl.style.display = 'none'; // Hidden by default
  
            groupTabs.forEach(tab => {
              const tabLi = createTabItem(tab, false);
              groupTabsUl.appendChild(tabLi);
            });
  
            groupLi.appendChild(groupTabsUl);
            tabsUl.appendChild(groupLi);
          } else {
            // Not in a group
            groupTabs.forEach(tab => {
              const tabLi = createTabItem(tab, false);
              tabsUl.appendChild(tabLi);
            });
          }
        });
  
        const openButton = document.createElement('button');
        openButton.textContent = 'Open All Tabs';
        openButton.className = 'open-button';
        openButton.addEventListener('click', () => {
          restoreSession(session);
        });
  
        details.appendChild(tabsUl);
        details.appendChild(openButton);
  
        li.appendChild(header);
        li.appendChild(details);
        tabsList.appendChild(li);
      });
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }
  

  // Function to toggle saved group tabs visibility
  function toggleSavedGroupTabs(groupItem) {
    const groupTabsList = groupItem.querySelector('.group-tabs-list');
    if (groupTabsList.style.display === 'none' || groupTabsList.style.display === '') {
      groupTabsList.style.display = 'block';
    } else {
      groupTabsList.style.display = 'none';
    }
  }

});
// Function to restore a specific group within a session
async function restoreGroup(session, groupId) {
    if (session.tabs && session.tabs.length > 0) {
      const groupTabsData = session.tabs.filter(tab => tab.groupId === parseInt(groupId));
  
      if (groupTabsData.length === 0) {
        alert('No tabs to restore in this group.');
        return;
      }
  
      // Create tabs without grouping first
      const createdTabs = [];
      for (const tabData of groupTabsData) {
        const createdTab = await chrome.tabs.create({
          url: tabData.url,
          pinned: tabData.pinned || false,
          active: false,
        });
        createdTabs.push({ createdTab, tabData });
      }
  
      // Recreate the group
      const newGroupId = await chrome.tabs.group({ tabIds: createdTabs.map(ct => ct.createdTab.id) });
  
      // Update group title and color
      const groupInfo = session.groups[groupId];
      await chrome.tabGroups.update(newGroupId, {
        title: groupInfo.title || '',
        color: groupInfo.color || 'grey',
      });
  
      // Activate the first tab in the group
      await chrome.tabs.update(createdTabs[0].createdTab.id, { active: true });
    } else {
      alert('No tabs to restore in this session.');
    }
  }
  

  // Function to load saved groups from all sessions and display them
async function loadSavedGroups() {
    try {
      // Clear the list
      savedGroupsList.innerHTML = '';
  
      // Get all sessions from the database
      const sessions = await db.sessions.toArray();
  
      if (sessions.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No saved groups found.';
        savedGroupsList.appendChild(li);
        return;
      }
  
      // Collect all groups from all sessions
      const groupsMap = {}; // Key: group title, Value: { groupInfo: {}, tabs: [] }
  
      sessions.forEach(session => {
        if (session.groups) {
          Object.values(session.groups).forEach(group => {
            const groupKey = group.title || 'Unnamed Group';
            if (!groupsMap[groupKey]) {
              groupsMap[groupKey] = { groupInfo: group, tabs: [] };
            }
          });
        }
      });
  
      // Collect tabs for each group
      sessions.forEach(session => {
        session.tabs.forEach(tab => {
          if (tab.groupId !== -1 && session.groups && session.groups[tab.groupId]) {
            const groupTitle = session.groups[tab.groupId].title || 'Unnamed Group';
            if (groupsMap[groupTitle]) {
              groupsMap[groupTitle].tabs.push({ tab: tab, session: session });
            }
          }
        });
      });
  
      // Display the groups
      for (const groupKey in groupsMap) {
        const groupData = groupsMap[groupKey];
  
        const li = document.createElement('li');
        li.className = 'group-item';
  
        // Group header
        const groupHeader = document.createElement('div');
        groupHeader.className = 'group-header';
  
        const groupName = document.createElement('span');
        groupName.textContent = groupKey;
        groupName.className = 'group-name';
        groupName.addEventListener('click', () => {
          toggleSavedGroupTabs(li);
        });
  
        groupHeader.appendChild(groupName);
  
        // Tabs in the group
        const groupTabsUl = document.createElement('ul');
        groupTabsUl.className = 'group-tabs-list';
        groupTabsUl.style.display = 'none'; // Hidden by default
  
        groupData.tabs.forEach(tabData => {
          const tab = tabData.tab;
          const tabLi = document.createElement('li');
          const tabLink = document.createElement('a');
          tabLink.href = '#';
          tabLink.textContent = tab.title || tab.url;
          tabLink.title = tab.url;
          tabLink.addEventListener('click', (event) => {
            event.preventDefault();
            chrome.tabs.create({ url: tab.url });
          });
          tabLi.appendChild(tabLink);
          groupTabsUl.appendChild(tabLi);
        });
  
        li.appendChild(groupHeader);
        li.appendChild(groupTabsUl);
        savedGroupsList.appendChild(li);
      }
  
      if (Object.keys(groupsMap).length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No saved groups found.';
        savedGroupsList.appendChild(li);
      }
    } catch (error) {
      console.error('Error loading saved groups:', error);
    }
  }
  
  // Function to toggle saved group tabs visibility
  function toggleSavedGroupTabs(groupItem) {
    const groupTabsList = groupItem.querySelector('.group-tabs-list');
    if (groupTabsList.style.display === 'none' || groupTabsList.style.display === '') {
      groupTabsList.style.display = 'block';
    } else {
      groupTabsList.style.display = 'none';
    }
  }
  